import { client, definirAmostragem, logger } from './obs';

export type Estrategia = 'PRINCIPAL' | 'ORCAMENTO';

/** Configuração mutável em tempo de execução: alterada pela governança via RabbitMQ. */
export const config = {
  estrategia: 'PRINCIPAL' as Estrategia,
  cacheAtivo: true,
  cacheTtlSeg: Number(process.env.CACHE_TTL_INICIAL_S ?? 30),
  cacheTamanhoMax: Number(process.env.CACHE_TAMANHO_INICIAL ?? 100),
  /** Apenas para demonstração/teste da governança (ver POST /admin/simulacao). */
  simulacaoLatenciaPrincipalMs: 0,
};

// ---- métricas de configuração (painel "Evolução Dinâmica") ----
new client.Gauge({
  name: 'cinebridge_config_estrategia_ativa',
  help: 'Estratégia de recomendação ativa (1 = ativa)',
  labelNames: ['estrategia'],
  collect() {
    for (const e of ['PRINCIPAL', 'ORCAMENTO'] as Estrategia[]) this.set({ estrategia: e }, config.estrategia === e ? 1 : 0);
  },
});
new client.Gauge({
  name: 'cinebridge_config_cache_ttl_segundos',
  help: 'Tempo de expiração do cache',
  collect() {
    this.set(config.cacheTtlSeg);
  },
});
new client.Gauge({
  name: 'cinebridge_config_cache_tamanho_max',
  help: 'Tamanho máximo do cache (entradas)',
  collect() {
    this.set(config.cacheTamanhoMax);
  },
});
new client.Gauge({
  name: 'cinebridge_config_cache_ativo',
  help: 'Cache ligado (1) ou desligado (0)',
  collect() {
    this.set(config.cacheAtivo ? 1 : 0);
  },
});

// ---- cache em memória (candidatos devolvidos pelo serviço de profissionais) ----
const cache = new Map<string, { valor: unknown; expira: number }>();
const consultasCache = new client.Counter({
  name: 'cinebridge_cache_consultas_total',
  help: 'Consultas ao cache',
  labelNames: ['resultado'],
});
new client.Gauge({
  name: 'cinebridge_cache_entradas',
  help: 'Entradas atualmente no cache',
  collect() {
    this.set(cache.size);
  },
});

export function cacheObter<T>(chave: string): T | undefined {
  if (!config.cacheAtivo) return undefined;
  const e = cache.get(chave);
  if (e && e.expira > Date.now()) {
    consultasCache.inc({ resultado: 'acerto' });
    return e.valor as T;
  }
  if (e) cache.delete(chave);
  consultasCache.inc({ resultado: 'falha' });
  return undefined;
}

export function cacheGravar(chave: string, valor: unknown): void {
  if (!config.cacheAtivo) return;
  cache.delete(chave);
  cache.set(chave, { valor, expira: Date.now() + config.cacheTtlSeg * 1000 });
  while (cache.size > config.cacheTamanhoMax) cache.delete(cache.keys().next().value as string);
}

const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

/** Aplica uma mensagem de configuração recebida da governança. */
export function aplicarConfig(msg: Record<string, unknown>): void {
  const antes = JSON.stringify(config);
  switch (msg.tipo) {
    case 'ESTRATEGIA':
      if (msg.valor === 'PRINCIPAL' || msg.valor === 'ORCAMENTO') config.estrategia = msg.valor;
      break;
    case 'CACHE': {
      const ttl = num(msg.ttlSeg, 1, 3600);
      const tam = num(msg.tamanhoMax, 1, 10000);
      if (ttl !== undefined) config.cacheTtlSeg = ttl;
      if (tam !== undefined) config.cacheTamanhoMax = Math.floor(tam);
      if (typeof msg.ativo === 'boolean') config.cacheAtivo = msg.ativo;
      while (cache.size > config.cacheTamanhoMax) cache.delete(cache.keys().next().value as string);
      break;
    }
    case 'AMOSTRAGEM': {
      const r = num(msg.razao, 0, 1);
      if (r !== undefined) {
        definirAmostragem(r);
        if (!msg.reafirmar) logger.info({ razao: r }, 'amostragem de traces ajustada');
      }
      break;
    }
    default:
      return;
  }
  // Só registra quando algo mudou (reafirmações periódicas da governança e mensagens inválidas não geram ruído).
  if (JSON.stringify(config) !== antes) logger.info({ configuracao: msg, atual: config }, 'configuração dinâmica aplicada');
}
