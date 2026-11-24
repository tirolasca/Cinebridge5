import type {
  Governanca,
  LinksObs,
  LinhaLog,
  Mensageria,
  Metricas,
  NovaRecomendacao,
  NovoProfissional,
  Notificacao,
  Overview,
  Profissional,
  Projeto,
  RecomendacaoRegistro,
  ResultadoRecomendacao,
  ResumoTrace,
} from '@/types/api';

const base = (): string => `${import.meta.env.BASE_URL}api`.replace('//', '/');

export class ApiError extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ApiError';
    this.status = status;
  }
}

let csrf: string | null = null;
let aoPerderSessao: (() => void) | null = null;
export const definirCsrf = (t: string | null): void => {
  csrf = t;
};
export const aoExpirarSessao = (fn: (() => void) | null): void => {
  aoPerderSessao = fn;
};

async function req<T>(caminho: string, op: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const metodo = op.metodo ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (op.corpo !== undefined) headers['content-type'] = 'application/json';
  if (metodo !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
  let r: Response;
  try {
    r = await fetch(`${base()}${caminho}`, {
      method: metodo,
      headers,
      body: op.corpo === undefined ? undefined : JSON.stringify(op.corpo),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  }
  if (r.status === 204) return undefined as T;
  const texto = await r.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* corpo não-JSON */
  }
  if (!r.ok) {
    if (r.status === 401 && !caminho.startsWith('/auth/')) aoPerderSessao?.();
    const msg = (json as { erro?: string } | null)?.erro ?? `Erro ${r.status}`;
    throw new ApiError(r.status, msg);
  }
  return json as T;
}

const qs = (p: Record<string, string | number | undefined>): string => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};

export const api = {
  login: (usuario: string, senha: string) =>
    req<{ usuario: string; csrf: string }>('/auth/login', { metodo: 'POST', corpo: { usuario, senha } }),
  logout: () => req<void>('/auth/logout', { metodo: 'POST' }),
  me: () => req<{ usuario: string; csrf: string }>('/auth/me'),
  overview: () => req<Overview>('/overview'),
  servicos: () => req<{ geradoEm: string; servicos: Overview['servicos'] }>('/servicos'),
  profissionais: () => req<Profissional[]>('/profissionais'),
  criarProfissional: (p: NovoProfissional) =>
    req<Profissional>('/profissionais', { metodo: 'POST', corpo: p }),
  projetos: () => req<Projeto[]>('/projetos'),
  projeto: (id: string) => req<Projeto>(`/projetos/${id}`),
  criarProjeto: (p: { titulo: string; orcamentoTotal: number; genero?: string }) =>
    req<Projeto>('/projetos', { metodo: 'POST', corpo: p }),
  atualizarProjeto: (id: string, p: { titulo?: string; status?: Projeto['status'] }) =>
    req<Projeto>(`/projetos/${id}`, { metodo: 'PATCH', corpo: p }),
  convite: (id: string, profissionalId: string, aceito: boolean) =>
    req<{ aceito: boolean }>(`/projetos/${id}/convites/${profissionalId}`, {
      metodo: 'POST',
      corpo: { aceito },
    }),
  recomendar: (r: NovaRecomendacao) =>
    req<ResultadoRecomendacao>('/recomendacoes', { metodo: 'POST', corpo: r }),
  recomendacoes: () => req<RecomendacaoRegistro[]>('/recomendacoes'),
  notificacoes: () => req<Notificacao[]>('/notificacoes'),
  mensageria: () => req<Mensageria>('/mensageria'),
  metricas: () => req<Metricas>('/observabilidade/metricas'),
  logs: (f: { servico?: string; nivel?: string; busca?: string; limite?: number }) =>
    req<{ linhas: LinhaLog[] }>(`/observabilidade/logs${qs(f)}`),
  traces: (servico: string) =>
    req<{ traces: ResumoTrace[]; jaegerUrl: string }>(`/observabilidade/traces${qs({ servico })}`),
  links: () => req<LinksObs>('/observabilidade/links'),
  governanca: () => req<Governanca>('/governanca'),
  trocarEstrategia: (valor: 'PRINCIPAL' | 'ORCAMENTO') =>
    req<{ estrategia: string; alterada: boolean }>('/governanca/estrategia', {
      metodo: 'POST',
      corpo: { valor },
    }),
};

export const urlStream = (): string => `${base()}/stream`;
