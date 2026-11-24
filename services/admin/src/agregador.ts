import type { Config } from './config';
import { chamar } from './http';
import type { Fontes } from './fontes';

export const SERVICOS = [
  { id: 'cinebridge-api', nome: 'API', papel: 'Recomendação de equipes e orquestração', dependencias: ['RabbitMQ', 'PostgreSQL (recomendações)'] },
  { id: 'cinebridge-profissionais', nome: 'Profissionais', papel: 'Cadastro e consulta de profissionais', dependencias: ['RabbitMQ', 'PostgreSQL (profissionais)'] },
  { id: 'cinebridge-projetos', nome: 'Projetos', papel: 'Projetos, equipes e convites', dependencias: ['RabbitMQ', 'PostgreSQL (projetos)'] },
  { id: 'cinebridge-notificacoes', nome: 'Notificações', papel: 'Eventos e entrega de notificações', dependencias: ['RabbitMQ', 'PostgreSQL (notificações)'] },
  { id: 'cinebridge-governanca', nome: 'Governança', papel: 'Regras autônomas e auditoria', dependencias: ['RabbitMQ', 'Prometheus'] },
] as const;

export type EstadoServico = 'saudavel' | 'degradado' | 'indisponivel';

export interface ServicoStatus {
  id: string;
  nome: string;
  papel: string;
  dependencias: readonly string[];
  estado: EstadoServico;
  latenciaMs: number | null;
  verificadoEm: string;
  detalhe: Record<string, unknown> | null;
  erros1h: number | null;
  latenciaP95Ms: number | null;
}

const urlDe = (cfg: Config, id: string): string =>
  ({
    'cinebridge-api': cfg.urls.api,
    'cinebridge-profissionais': cfg.urls.profissionais,
    'cinebridge-projetos': cfg.urls.projetos,
    'cinebridge-notificacoes': cfg.urls.notificacoes,
    'cinebridge-governanca': cfg.urls.governanca,
  })[id] as string;

export async function tentar<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function statusServicos(cfg: Config, f: Fontes): Promise<ServicoStatus[]> {
  const [erros, p95] = await Promise.all([
    tentar(() => f.prom.vetor('sum by (servico) (increase(cinebridge_http_requests_total{status=~"5.."}[1h]))')),
    tentar(() =>
      f.prom.vetor(
        'histogram_quantile(0.95, sum by (le, servico) (rate(cinebridge_http_request_duration_seconds_bucket{rota!~"/health|/metrics"}[5m])))',
      ),
    ),
  ]);
  return Promise.all(
    SERVICOS.map(async (s): Promise<ServicoStatus> => {
      const verificadoEm = new Date().toISOString();
      let estado: EstadoServico = 'indisponivel';
      let latenciaMs: number | null = null;
      let detalhe: Record<string, unknown> | null = null;
      try {
        const r = await chamar<Record<string, unknown>>(`${urlDe(cfg, s.id)}/health`, { timeoutMs: 3000 });
        latenciaMs = r.ms;
        detalhe = r.corpo && typeof r.corpo === 'object' ? r.corpo : null;
        estado = r.status === 200 ? 'saudavel' : r.status === 503 ? 'degradado' : 'indisponivel';
      } catch {
        /* indisponível */
      }
      const e = erros?.find((x) => x.metrica.servico === s.id)?.valor;
      const l = p95?.find((x) => x.metrica.servico === s.id)?.valor;
      return {
        ...s,
        estado,
        latenciaMs,
        verificadoEm,
        detalhe,
        erros1h: e === undefined ? null : Math.round(e),
        latenciaP95Ms: l === undefined ? null : Math.round(l * 1000),
      };
    }),
  );
}

export interface Overview {
  geradoEm: string;
  fontes: { prometheus: boolean; rabbitmq: boolean; governanca: boolean };
  saude: { estado: 'saudavel' | 'degradado' | 'critico'; ok: number; total: number };
  servicos: ServicoStatus[];
  contadores: { profissionais: number | null; projetos: number | null; projetosEmAndamento: number | null };
  desempenho: {
    latenciaP95Ms: number | null;
    taxaErros: number | null;
    cpuPct: number | null;
    memoriaBytes: number | null;
    filaPendente: number | null;
    requisicoesPorSegundo: number | null;
  };
  notificacoesRecentes: { id: string; tipo: string; assunto: string; mensagem: string; criadoEm: string }[];
  eventos: { tipo: 'governanca' | 'notificacao'; titulo: string; detalhe: string; em: string }[];
  disponibilidade: { t: number; v: number }[];
}

export function estadoGeral(servicos: ServicoStatus[]): Overview['saude'] {
  const ok = servicos.filter((s) => s.estado === 'saudavel').length;
  const fora = servicos.filter((s) => s.estado === 'indisponivel').length;
  const apiFora = servicos.find((s) => s.id === 'cinebridge-api')?.estado === 'indisponivel';
  const estado = ok === servicos.length ? 'saudavel' : apiFora || fora >= 2 ? 'critico' : 'degradado';
  return { estado, ok, total: servicos.length };
}

const headersAdmin = (cfg: Config): Record<string, string> => (cfg.adminToken ? { authorization: `Bearer ${cfg.adminToken}` } : {});

export async function auditoriaGovernanca(cfg: Config, limite: number): Promise<Record<string, unknown>[] | null> {
  return tentar(async () => {
    const r = await chamar<Record<string, unknown>[]>(`${cfg.urls.governanca}/auditoria?limite=${limite}`, { headers: headersAdmin(cfg), timeoutMs: 4000 });
    if (r.status !== 200 || !Array.isArray(r.corpo)) throw new Error('auditoria indisponível');
    return r.corpo;
  });
}

export async function calcularOverview(cfg: Config, f: Fontes): Promise<Overview> {
  const agora = Math.floor(Date.now() / 1000);
  const [servicos, profissionais, projetosPorStatus, p95, erros, cpu, mem, rps, filas, disp, notif, audit] = await Promise.all([
    statusServicos(cfg, f),
    tentar(() => f.prom.instantaneo('max(cinebridge_profissionais_total)')),
    tentar(() => f.prom.vetor('max by (status) (cinebridge_projetos_por_status)')),
    tentar(() =>
      f.prom.instantaneo('histogram_quantile(0.95, sum by (le) (rate(cinebridge_http_request_duration_seconds_bucket{rota!~"/health|/metrics"}[5m])))'),
    ),
    tentar(() =>
      f.prom.instantaneo(
        'sum(rate(cinebridge_http_requests_total{status=~"5.."}[5m])) / sum(rate(cinebridge_http_requests_total[5m]))',
      ),
    ),
    tentar(() => f.prom.instantaneo('avg(rate(cinebridge_process_cpu_seconds_total[1m])) * 100')),
    tentar(() => f.prom.instantaneo('sum(cinebridge_process_resident_memory_bytes)')),
    tentar(() => f.prom.instantaneo('sum(rate(cinebridge_http_requests_total{rota!~"/health|/metrics"}[5m]))')),
    tentar(() => f.rabbit.filas()),
    tentar(() => f.prom.intervalo('avg(up{job="cinebridge-servicos"})', agora - 24 * 3600, agora, 900)),
    tentar(async () => {
      const r = await chamar<Overview['notificacoesRecentes']>(`${cfg.urls.notificacoes}/notificacoes`, { timeoutMs: 4000 });
      return Array.isArray(r.corpo) ? r.corpo.slice(0, 8) : [];
    }),
    auditoriaGovernanca(cfg, 8),
  ]);

  const projetosTotal = projetosPorStatus ? projetosPorStatus.reduce((a, x) => a + x.valor, 0) : null;
  const emAndamento = projetosPorStatus ? (projetosPorStatus.find((x) => x.metrica.status === 'EM_ANDAMENTO')?.valor ?? 0) : null;
  const filaPendente = filas ? filas.filter((q) => !q.temporaria).reduce((a, q) => a + q.prontas, 0) : null;

  const eventos: Overview['eventos'] = [
    ...(audit ?? []).map((a) => ({
      tipo: 'governanca' as const,
      titulo: String(a.acao ?? 'ação'),
      detalhe: Object.entries(a)
        .filter(([k]) => !['acao', 'timestamp'].includes(k))
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(' · '),
      em: String(a.timestamp ?? ''),
    })),
    ...(notif ?? []).map((n) => ({ tipo: 'notificacao' as const, titulo: n.assunto, detalhe: n.mensagem, em: n.criadoEm })),
  ]
    .filter((e) => e.em)
    .sort((a, b) => (a.em < b.em ? 1 : -1))
    .slice(0, 10);

  return {
    geradoEm: new Date().toISOString(),
    fontes: { prometheus: p95 !== null || cpu !== null || profissionais !== null, rabbitmq: filas !== null, governanca: audit !== null },
    saude: estadoGeral(servicos),
    servicos,
    contadores: {
      profissionais: profissionais === null ? null : Math.round(profissionais),
      projetos: projetosTotal === null ? null : Math.round(projetosTotal),
      projetosEmAndamento: emAndamento === null ? null : Math.round(emAndamento),
    },
    desempenho: {
      latenciaP95Ms: p95 === null ? null : Math.round(p95 * 1000),
      taxaErros: erros,
      cpuPct: cpu === null ? null : Math.round(cpu * 10) / 10,
      memoriaBytes: mem === null ? null : Math.round(mem),
      filaPendente,
      requisicoesPorSegundo: rps === null ? null : Math.round(rps * 100) / 100,
    },
    notificacoesRecentes: notif ?? [],
    eventos,
    disponibilidade: disp ?? [],
  };
}

/** Cache curto + deduplicação: N clientes (ou N abas) geram uma única rodada de consultas por intervalo. */
export function criarCacheOverview(cfg: Config, f: Fontes, ttlMs = 5000) {
  let ultimo: { em: number; valor: Overview } | null = null;
  let emVoo: Promise<Overview> | null = null;
  return async (): Promise<Overview> => {
    if (ultimo && Date.now() - ultimo.em < ttlMs) return ultimo.valor;
    emVoo ??= calcularOverview(cfg, f)
      .then((v) => {
        ultimo = { em: Date.now(), valor: v };
        return v;
      })
      .finally(() => {
        emVoo = null;
      });
    return emVoo;
  };
}
