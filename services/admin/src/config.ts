export interface Config {
  porta: number;
  /** Caminho público do painel (o Caddy encaminha /painel* para este serviço). */
  base: string;
  producao: boolean;
  usuario: string;
  /** Hash scrypt da senha do administrador; null só fora de produção (senha aleatória gerada no start). */
  senhaHash: string | null;
  sessaoMin: number;
  ociosoMin: number;
  cookieSeguro: boolean;
  adminToken: string | undefined;
  limiteLogin: number;
  trustProxy: boolean;
  staticDir: string;
  rabbit: { url: string; usuario: string; senha: string };
  urls: {
    api: string;
    profissionais: string;
    projetos: string;
    notificacoes: string;
    governanca: string;
    prometheus: string;
    loki: string;
    jaeger: string;
    grafanaPublico: string;
    jaegerPublico: string;
  };
}

type Env = Record<string, string | undefined>;

export function carregarConfig(env: Env = process.env): Config {
  const producao = env.AMBIENTE === 'producao';
  const base = (env.PAINEL_BASE ?? '/painel').replace(/\/+$/, '');
  const faltando: string[] = [];
  if (producao) for (const n of ['ADMIN_USER', 'ADMIN_PASSWORD_HASH', 'ADMIN_TOKEN', 'RABBITMQ_USER', 'RABBITMQ_PASSWORD']) if (!env[n]) faltando.push(n);
  if (faltando.length) throw new Error(`Configuração de produção inválida: ${faltando.join(', ')} não definida(s)`);
  if (producao && (env.ADMIN_TOKEN ?? '').length < 24) throw new Error('Configuração de produção inválida: ADMIN_TOKEN deve ter ao menos 24 caracteres');
  return {
    porta: Number(env.PORT ?? 3010),
    base,
    producao,
    usuario: env.ADMIN_USER ?? 'admin',
    senhaHash: env.ADMIN_PASSWORD_HASH || null,
    sessaoMin: Number(env.SESSAO_MINUTOS ?? 480),
    ociosoMin: Number(env.SESSAO_OCIOSA_MINUTOS ?? 30),
    cookieSeguro: env.COOKIE_SEGURO ? env.COOKIE_SEGURO === 'true' : producao,
    adminToken: env.ADMIN_TOKEN || undefined,
    limiteLogin: Number(env.LIMITE_LOGIN_POR_MINUTO ?? 5),
    trustProxy: env.TRUST_PROXY === 'true',
    staticDir: env.STATIC_DIR ?? 'public',
    rabbit: {
      url: env.RABBITMQ_MGMT_URL ?? 'http://cinebridge-mq:15672',
      usuario: env.RABBITMQ_USER ?? 'guest',
      senha: env.RABBITMQ_PASSWORD ?? 'guest',
    },
    urls: {
      api: env.URL_API ?? 'http://cinebridge-api:3000',
      profissionais: env.URL_PROFISSIONAIS ?? 'http://cinebridge-profissionais:3001',
      projetos: env.URL_PROJETOS ?? 'http://cinebridge-projetos:3002',
      notificacoes: env.URL_NOTIFICACOES ?? 'http://cinebridge-notificacoes:3003',
      governanca: env.URL_GOVERNANCA ?? 'http://cinebridge-governanca:3004',
      prometheus: env.URL_PROMETHEUS ?? 'http://cinebridge-prometheus:9090',
      loki: env.URL_LOKI ?? 'http://cinebridge-loki:3100',
      jaeger: env.URL_JAEGER ?? 'http://cinebridge-jaeger:16686',
      grafanaPublico: env.GRAFANA_URL_PUBLICA ?? 'http://localhost:3005',
      jaegerPublico: env.JAEGER_URL_PUBLICA ?? 'http://localhost:16686',
    },
  };
}
