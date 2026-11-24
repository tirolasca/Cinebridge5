import { render } from '@testing-library/react';
import { vi } from 'vitest';
import App from '@/App';
import { definirCsrf } from '@/services/api';
import type { Governanca, Mensageria, Overview, Profissional, Projeto } from '@/types/api';

export interface Chamada {
  metodo: string;
  caminho: string;
  corpo: unknown;
  headers: Record<string, string>;
}
type Handler = unknown | ((c: Chamada) => unknown);

export const resp = (status: number, corpo?: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(corpo ?? {}), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Simula o BFF: mapeia "METODO /caminho" para uma resposta (ou função). Registra todas as chamadas. */
export function mockApi(rotas: Record<string, Handler>) {
  const chamadas: Chamada[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const caminho = url.replace(/^.*\/painel\/api/, '');
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const c: Chamada = {
      metodo,
      caminho,
      corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
    };
    chamadas.push(c);
    const h = rotas[`${metodo} ${caminho}`] ?? rotas[`${metodo} ${caminho.split('?')[0]}`];
    if (h === undefined) return resp(404, { erro: `rota não simulada: ${metodo} ${caminho}` });
    const r = typeof h === 'function' ? (h as (c: Chamada) => unknown)(c) : h;
    return r instanceof Response ? r : resp(200, r);
  });
  vi.stubGlobal('fetch', f);
  return {
    chamadas,
    doMetodo: (m: string, p: string) => chamadas.filter((c) => c.metodo === m && c.caminho.startsWith(p)),
  };
}

export const SESSAO = { usuario: 'admin', csrf: 'csrf-teste' };
export const autenticado = { 'GET /auth/me': SESSAO };
export const anonimo = { 'GET /auth/me': () => resp(401, { erro: 'não autenticado' }) };

export function renderApp(rota = '/') {
  window.history.pushState({}, '', `/painel${rota === '/' ? '/' : rota}`);
  definirCsrf(null);
  return render(<App />);
}

// ------------------------------------------------------------------ fixtures
export const overview = (o: Partial<Overview> = {}): Overview => ({
  geradoEm: new Date().toISOString(),
  fontes: { prometheus: true, rabbitmq: true, governanca: true },
  saude: { estado: 'saudavel', ok: 5, total: 5 },
  servicos: ['API', 'Profissionais', 'Projetos', 'Notificações', 'Governança'].map((nome, i) => ({
    id: `cinebridge-${i}`,
    nome,
    papel: 'x',
    dependencias: [],
    estado: 'saudavel' as const,
    latenciaMs: 12,
    verificadoEm: new Date().toISOString(),
    detalhe: null,
    erros1h: 0,
    latenciaP95Ms: 40,
  })),
  contadores: { profissionais: 12, projetos: 7, projetosEmAndamento: 4 },
  desempenho: {
    latenciaP95Ms: 120,
    taxaErros: 0.002,
    cpuPct: 8.5,
    memoriaBytes: 400 * 1024 * 1024,
    filaPendente: 3,
    requisicoesPorSegundo: 1.25,
  },
  notificacoesRecentes: [
    {
      id: 'n1',
      tipo: 'PROJETO_CRIADO',
      assunto: 'Novo projeto criado',
      mensagem: 'Projeto X',
      criadoEm: new Date().toISOString(),
    },
  ],
  eventos: [{ tipo: 'governanca', titulo: 'AJUSTE_CACHE', detalhe: 'ttl: 60', em: new Date().toISOString() }],
  disponibilidade: [
    { t: 1_700_000_000_000, v: 1 },
    { t: 1_700_000_900_000, v: 0.9 },
  ],
  ...o,
});

export const profissionais = (n: number): Profissional[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    nome: `Profissional ${String(i + 1).padStart(2, '0')}`,
    papel: ['DIRETOR', 'EDITOR', 'ROTEIRISTA'][i % 3]!,
    custo: 1000 + i * 100,
    notaMedia: 4.2,
    competencias: i % 2 ? ['edição', 'cor'] : ['direção'],
  }));

export const UUID_P = '11111111-1111-4111-8111-111111111111';
export const UUID_M = '22222222-2222-4222-8222-222222222222';
export const projeto = (over: Partial<Projeto> = {}): Projeto => ({
  id: UUID_P,
  titulo: 'Raízes do Sertão',
  genero: 'DOCUMENTARIO',
  orcamentoTotal: 40000,
  status: 'EM_ANDAMENTO',
  criadoEm: '2026-11-18T10:00:00.000Z',
  equipe: [
    { papel: 'DIRETOR', profissionalId: UUID_M, nome: 'Ana Lima', custo: 12000 },
    { papel: 'EDITOR', profissionalId: null, nome: null, custo: 0 },
  ],
  ...over,
});

export const mensageria = (o: Partial<Mensageria> = {}): Mensageria => ({
  geradoEm: new Date().toISOString(),
  totais: {
    filas: 1,
    prontas: 3,
    naoConfirmadas: 1,
    consumidores: 1,
    taxaPublicacao: 1.5,
    taxaConsumo: 1.2,
    errosUltimaHora: 2,
  },
  filas: [
    {
      nome: 'registro-projetos',
      estado: 'running',
      mensagens: 4,
      prontas: 3,
      naoConfirmadas: 1,
      consumidores: 1,
      publicadas: 10,
      entregues: 9,
      confirmadas: 9,
      taxaPublicacao: 1.5,
      taxaConsumo: 1.2,
      temporaria: false,
      duravel: true,
    },
    {
      nome: 'amq.gen-xyz',
      estado: 'running',
      mensagens: 0,
      prontas: 0,
      naoConfirmadas: 0,
      consumidores: 1,
      publicadas: 0,
      entregues: 0,
      confirmadas: 0,
      taxaPublicacao: 0,
      taxaConsumo: 0,
      temporaria: true,
      duravel: false,
    },
  ],
  deadLetter: [],
  deadLetterConfigurado: false,
  ...o,
});

export const governanca = (o: Partial<Governanca> = {}): Governanca => ({
  geradoEm: new Date().toISOString(),
  estado: {
    estado: {
      estrategia: 'PRINCIPAL',
      estrategiaDesde: Date.now() / 1000 - 600,
      cacheTtlSeg: 60,
      cacheTamanhoMax: 200,
      amostragem: 1,
    },
    limiares: { latenciaLimiteS: 2 },
    dockerHabilitado: false,
  },
  configApi: { estrategia: 'PRINCIPAL', cacheAtivo: true, cacheTtlSeg: 60, cacheTamanhoMax: 200 },
  auditoria: [
    { timestamp: '2026-11-18T11:00:00.000Z', acao: 'AJUSTE_CACHE', para: { ttlSeg: 60 } },
    {
      timestamp: '2026-11-18T11:05:00.000Z',
      acao: 'TROCA_ESTRATEGIA_MANUAL',
      de: 'ORCAMENTO',
      para: 'PRINCIPAL',
      operador: 'admin',
    },
  ],
  ...o,
});
