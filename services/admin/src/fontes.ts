import type { Config } from './config';
import { chamar } from './http';

export interface Fila {
  nome: string;
  estado: string;
  mensagens: number;
  prontas: number;
  naoConfirmadas: number;
  consumidores: number;
  publicadas: number;
  entregues: number;
  confirmadas: number;
  taxaPublicacao: number;
  taxaConsumo: number;
  temporaria: boolean;
  duravel: boolean;
}

export interface LinhaLog {
  em: string;
  nivel: string;
  servico: string;
  mensagem: string;
  correlationId?: string;
  extra: Record<string, unknown>;
}

export interface ResumoTrace {
  traceId: string;
  raiz: string;
  servicos: string[];
  spans: number;
  erros: number;
  duracaoMs: number;
  inicio: string;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/** Escapa texto para uso dentro de aspas em LogQL. */
const aspas = (t: string): string => t.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export type Fontes = ReturnType<typeof criarFontes>;

export function criarFontes(cfg: Config) {
  const prom = {
    async instantaneo(q: string): Promise<number | null> {
      const v = (await prom.vetor(q))[0]?.valor;
      return v ?? null;
    },
    async vetor(q: string): Promise<{ metrica: Record<string, string>; valor: number }[]> {
      const r = await chamar<{ data?: { result?: { metric: Record<string, string>; value: [number, string] }[] } }>(
        `${cfg.urls.prometheus}/api/v1/query?query=${encodeURIComponent(q)}`,
        { timeoutMs: 6000 },
      );
      if (r.status !== 200) throw new Error(`Prometheus ${r.status}`);
      return (r.corpo.data?.result ?? [])
        .map((x) => ({ metrica: x.metric, valor: Number(x.value[1]) }))
        .filter((x) => Number.isFinite(x.valor));
    },
    async intervalo(q: string, inicioS: number, fimS: number, passoS: number): Promise<{ t: number; v: number }[]> {
      const r = await chamar<{ data?: { result?: { values: [number, string][] }[] } }>(
        `${cfg.urls.prometheus}/api/v1/query_range?query=${encodeURIComponent(q)}&start=${inicioS}&end=${fimS}&step=${passoS}`,
        { timeoutMs: 8000 },
      );
      if (r.status !== 200) throw new Error(`Prometheus ${r.status}`);
      return (r.corpo.data?.result?.[0]?.values ?? []).map(([t, v]) => ({ t: t * 1000, v: Number(v) })).filter((p) => Number.isFinite(p.v));
    },
  };

  const rabbit = {
    async filas(): Promise<Fila[]> {
      const auth = 'Basic ' + Buffer.from(`${cfg.rabbit.usuario}:${cfg.rabbit.senha}`).toString('base64');
      const r = await chamar<Record<string, any>[]>(`${cfg.rabbit.url}/api/queues`, { headers: { authorization: auth }, timeoutMs: 6000 });
      if (r.status !== 200 || !Array.isArray(r.corpo)) throw new Error(`RabbitMQ ${r.status}`);
      return r.corpo
        .map((q) => ({
          nome: String(q.name),
          estado: String(q.state ?? 'desconhecido'),
          mensagens: num(q.messages),
          prontas: num(q.messages_ready),
          naoConfirmadas: num(q.messages_unacknowledged),
          consumidores: num(q.consumers),
          publicadas: num(q.message_stats?.publish),
          entregues: num(q.message_stats?.deliver_get),
          confirmadas: num(q.message_stats?.ack),
          taxaPublicacao: num(q.message_stats?.publish_details?.rate),
          taxaConsumo: num(q.message_stats?.deliver_get_details?.rate),
          temporaria: Boolean(q.exclusive || q.auto_delete),
          duravel: Boolean(q.durable),
        }))
        .sort((a, b) => Number(a.temporaria) - Number(b.temporaria) || a.nome.localeCompare(b.nome));
    },
  };

  const loki = {
    async logs(o: { servico?: string; nivel?: string; busca?: string; limite: number; minutos: number }): Promise<LinhaLog[]> {
      let seletor = o.servico ? `servico="${o.servico}"` : 'servico=~"cinebridge-.+"';
      if (o.nivel) seletor += `,nivel="${o.nivel}"`;
      const consulta = `{${seletor}}` + (o.busca ? ` |= "${aspas(o.busca)}"` : '');
      const fim = Date.now() * 1e6;
      const inicio = fim - o.minutos * 60 * 1e9;
      const r = await chamar<{ data?: { result?: { values: [string, string][] }[] } }>(
        `${cfg.urls.loki}/loki/api/v1/query_range?query=${encodeURIComponent(consulta)}&limit=${o.limite}&direction=backward&start=${inicio}&end=${fim}`,
        { timeoutMs: 8000 },
      );
      if (r.status !== 200) throw new Error(`Loki ${r.status}`);
      const linhas: (LinhaLog & { ns: bigint })[] = [];
      for (const s of r.corpo.data?.result ?? []) {
        for (const [ns, texto] of s.values) {
          let j: Record<string, unknown> = {};
          try {
            j = JSON.parse(texto);
          } catch {
            j = { mensagem: texto };
          }
          const { timestamp, nivel, servico, mensagem, correlationId, ...extra } = j;
          linhas.push({
            ns: BigInt(ns),
            em: typeof timestamp === 'string' ? timestamp : new Date(Number(BigInt(ns) / 1000000n)).toISOString(),
            nivel: String(nivel ?? 'info'),
            servico: String(servico ?? ''),
            mensagem: String(mensagem ?? ''),
            correlationId: typeof correlationId === 'string' ? correlationId : undefined,
            extra,
          });
        }
      }
      return linhas
        .sort((a, b) => (a.ns < b.ns ? 1 : -1))
        .slice(0, o.limite)
        .map(({ ns: _ns, ...l }) => l);
    },
  };

  const jaeger = {
    async servicos(): Promise<string[]> {
      const r = await chamar<{ data?: string[] }>(`${cfg.urls.jaeger}/api/services`, { timeoutMs: 5000 });
      if (r.status !== 200) throw new Error(`Jaeger ${r.status}`);
      return (r.corpo.data ?? []).filter((s) => s.startsWith('cinebridge-')).sort();
    },
    async traces(servico: string, limite: number): Promise<ResumoTrace[]> {
      const r = await chamar<{ data?: Record<string, any>[] }>(
        `${cfg.urls.jaeger}/api/traces?service=${encodeURIComponent(servico)}&limit=${limite}&lookback=1h`,
        { timeoutMs: 8000 },
      );
      if (r.status !== 200) throw new Error(`Jaeger ${r.status}`);
      return (r.corpo.data ?? [])
        .map((t) => {
          const spans: Record<string, any>[] = t.spans ?? [];
          const ini = Math.min(...spans.map((s) => num(s.startTime)));
          const fim = Math.max(...spans.map((s) => num(s.startTime) + num(s.duration)));
          const raiz = spans.find((s) => !(s.references ?? []).length) ?? spans[0];
          const erro = (s: Record<string, any>) => (s.tags ?? []).some((g: any) => (g.key === 'error' && g.value === true) || (g.key === 'otel.status_code' && g.value === 'ERROR'));
          return {
            traceId: String(t.traceID),
            raiz: String(raiz?.operationName ?? '?'),
            servicos: [...new Set(Object.values<any>(t.processes ?? {}).map((p) => String(p.serviceName)))].sort(),
            spans: spans.length,
            erros: spans.filter(erro).length,
            duracaoMs: Math.round((fim - ini) / 1000),
            inicio: new Date(ini / 1000).toISOString(),
          };
        })
        .sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
    },
  };

  return { prom, rabbit, loki, jaeger };
}
