export type EstadoServico = 'saudavel' | 'degradado' | 'indisponivel';

export interface ServicoStatus {
  id: string;
  nome: string;
  papel: string;
  dependencias: string[];
  estado: EstadoServico;
  latenciaMs: number | null;
  verificadoEm: string;
  detalhe: Record<string, unknown> | null;
  erros1h: number | null;
  latenciaP95Ms: number | null;
}

export interface Evento {
  tipo: 'governanca' | 'notificacao';
  titulo: string;
  detalhe: string;
  em: string;
}

export interface Notificacao {
  id: string;
  tipo: string;
  assunto: string;
  mensagem: string;
  criadoEm: string;
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
  notificacoesRecentes: Notificacao[];
  eventos: Evento[];
  disponibilidade: { t: number; v: number }[];
}

export interface Profissional {
  id: string;
  nome: string;
  papel: string;
  custo: number;
  notaMedia: number;
  competencias: string[];
}
export type NovoProfissional = Omit<Profissional, 'id'>;

export interface MembroEquipe {
  papel: string;
  profissionalId: string | null;
  nome: string | null;
  custo: number;
}

export interface Projeto {
  id: string;
  titulo: string;
  genero: string;
  orcamentoTotal: number;
  status: 'EM_ANDAMENTO' | 'FINALIZADO';
  equipe: MembroEquipe[];
  criadoEm: string;
}

export interface NovaRecomendacao {
  titulo: string;
  orcamentoTotal: number;
  genero?: string;
  papeisRequeridos: { papel: string }[];
}

export interface ResultadoRecomendacao {
  recomendacaoId: number | string;
  projetoId: string | null;
  estrategia: string;
  itens: MembroEquipe[];
  parcial: boolean;
  custoPlanejado: number;
  dentroDoOrcamento: boolean;
  aviso?: string;
}

export interface RecomendacaoRegistro {
  id: number | string;
  projetoId: string | null;
  titulo: string;
  criadoEm: string;
}

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

export interface Mensageria {
  geradoEm: string;
  totais: {
    filas: number;
    prontas: number;
    naoConfirmadas: number;
    consumidores: number;
    taxaPublicacao: number;
    taxaConsumo: number;
    errosUltimaHora: number | null;
  };
  filas: Fila[];
  deadLetter: Fila[];
  deadLetterConfigurado: boolean;
}

export interface MetricasServico {
  id: string;
  nome: string;
  latenciaP50Ms: number | null;
  latenciaP95Ms: number | null;
  taxaErros: number | null;
  cpuPct: number | null;
  heapBytes: number | null;
  reqPorSegundo: number | null;
}
export interface Metricas {
  geradoEm: string;
  prometheusDisponivel: boolean;
  servicos: MetricasServico[];
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

export interface LinksObs {
  grafana: string;
  jaeger: string;
  dashboards: { nome: string; url: string }[];
}

export interface RegistroAuditoria {
  timestamp?: string;
  acao?: string;
  [k: string]: unknown;
}

export interface Governanca {
  geradoEm: string;
  estado: {
    estado: {
      estrategia: 'PRINCIPAL' | 'ORCAMENTO';
      estrategiaDesde: number;
      cacheTtlSeg: number;
      cacheTamanhoMax: number;
      amostragem: number;
    };
    limiares: Record<string, unknown>;
    dockerHabilitado: boolean;
  };
  configApi: {
    estrategia?: string;
    cacheAtivo?: boolean;
    cacheTtlSeg?: number;
    cacheTamanhoMax?: number;
  } | null;
  auditoria: RegistroAuditoria[];
}
