import Fastify from 'fastify';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { logger, instrumentarFastify, client, encerrar } from './obs';
import { conectar, criarCanal, publicarConfig, mqSaudavel, type Canal } from './mq';
import { consultar } from './prometheus';
import * as docker from './docker';
import { exigirAdmin, validarAmbiente } from './seguranca';

const PORTA = Number(process.env.PORT ?? 3004);
/** DOCKER_HABILITADO=false (ambientes sem acesso ao Docker Engine): sem escalonamento nem rotação por volume. */
const DOCKER_HABILITADO = process.env.DOCKER_HABILITADO !== 'false';
const env = (nome: string, padrao: number): number => {
  const v = Number(process.env[nome] ?? padrao);
  return Number.isFinite(v) ? v : padrao;
};

/** Todos os limiares são configuráveis; os padrões seguem o enunciado da atividade. */
const CFG = {
  intervaloS: env('INTERVALO_S', 15),
  // 1) alternância de estratégia: latência > 2 s por mais de 5 min
  latenciaLimiteS: env('LATENCIA_LIMITE_S', 2),
  latenciaJanelaS: env('LATENCIA_JANELA_S', 300),
  reversaoS: env('REVERSAO_S', 900), // tempo na estratégia rápida antes de tentar voltar à principal
  // 2) cache: <30% aumenta, >80% reduz
  cacheAcertoMin: env('CACHE_ACERTO_MIN', 0.3),
  cacheAcertoMax: env('CACHE_ACERTO_MAX', 0.8),
  cacheAmostraMin: env('CACHE_AMOSTRA_MIN', 20),
  cacheCooldownS: env('CACHE_COOLDOWN_S', 120),
  ttlMin: env('CACHE_TTL_MIN_S', 5),
  ttlMax: env('CACHE_TTL_MAX_S', 600),
  tamanhoMax: env('CACHE_TAMANHO_MAX', 1000),
  // 3) escalonamento: CPU > 70% por 10 min sobe; < 30% desce
  cpuAltoPct: env('CPU_ALTO_PCT', 70),
  cpuBaixoPct: env('CPU_BAIXO_PCT', 30),
  cpuJanelaS: env('CPU_JANELA_S', 600),
  replicasMax: env('REPLICAS_MAX', 3),
  servicosEscalaveis: (process.env.SERVICOS_ESCALAVEIS ?? 'cinebridge-profissionais,cinebridge-projetos,cinebridge-notificacoes')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // 4) volume de dados: rotação de logs e redução da amostragem de traces
  limiteLokiMb: env('LIMITE_LOKI_MB', 512),
  limiteJaegerMb: env('LIMITE_JAEGER_MB', 256),
  logsMantidosH: env('LOGS_MANTIDOS_H', 24),
  intervaloVolumesS: env('INTERVALO_VOLUMES_S', 300),
  lokiUrl: process.env.LOKI_URL ?? 'http://cinebridge-loki:3100',
  grafanaUrl: process.env.GRAFANA_URL ?? 'http://cinebridge-grafana:3000',
  grafanaUsuario: process.env.GRAFANA_USUARIO ?? 'admin',
  grafanaSenha: process.env.GRAFANA_SENHA ?? 'cinebridge',
  arquivoAuditoria: process.env.ARQUIVO_AUDITORIA ?? '/data/auditoria.jsonl',
};

// ---------------------------------------------------------------- métricas da governança
const acoes = new client.Counter({ name: 'cinebridge_governanca_acoes_total', help: 'Ações autônomas executadas', labelNames: ['acao'] });
const ciclos = new client.Counter({ name: 'cinebridge_governanca_ciclos_total', help: 'Ciclos de avaliação executados' });
const violando = new client.Gauge({ name: 'cinebridge_governanca_regra_violando_segundos', help: 'Há quanto tempo a regra está violada', labelNames: ['regra'] });
const dockerGauge = new client.Gauge({ name: 'cinebridge_governanca_docker_habilitado', help: '1 se a governança tem acesso ao Docker (escalonamento e volumes)', collect() { this.set(DOCKER_HABILITADO ? 1 : 0); } });
const volumeBytes = new client.Gauge({ name: 'cinebridge_volume_bytes', help: 'Tamanho dos volumes de dados', labelNames: ['volume'] });
const replicasGauge = new client.Gauge({ name: 'cinebridge_governanca_replicas_extras', help: 'Réplicas extras criadas pela governança', labelNames: ['servico'] });

// ---------------------------------------------------------------- estado
const estado = {
  estrategia: 'PRINCIPAL' as 'PRINCIPAL' | 'ORCAMENTO',
  estrategiaDesde: Date.now() / 1000,
  cacheTtlSeg: env('CACHE_TTL_INICIAL_S', 30),
  cacheTamanhoMax: env('CACHE_TAMANHO_INICIAL', 100),
  cacheUltimoAjuste: 0,
  amostragem: 1,
  lokiUltimaLimpeza: 0,
  volumesUltimaLeitura: 0,
};

/** Mede há quanto tempo uma condição vem sendo verdadeira de forma ininterrupta. */
class Sustentada {
  private desde: number | null = null;
  atualizar(condicao: boolean, agora: number): number {
    if (!condicao) this.desde = null;
    else this.desde ??= agora;
    return this.desde === null ? 0 : agora - this.desde;
  }
  zerar(): void {
    this.desde = null;
  }
}
const latenciaAlta = new Sustentada();
const cpuAlta = new Map<string, Sustentada>();
const cpuBaixa = new Map<string, Sustentada>();
const sust = (m: Map<string, Sustentada>, k: string) => m.get(k) ?? m.set(k, new Sustentada()).get(k)!;

// ---------------------------------------------------------------- auditoria
async function auditar(acao: string, detalhes: Record<string, unknown>): Promise<void> {
  acoes.inc({ acao });
  logger.info({ auditoria: true, acao, ...detalhes }, `[auditoria] ${acao}`);
  const linha = JSON.stringify({ timestamp: new Date().toISOString(), acao, ...detalhes }) + '\n';
  await appendFile(CFG.arquivoAuditoria, linha).catch((e) => logger.warn({ erro: (e as Error).message }, 'falha ao gravar auditoria'));
  // Anotação no Grafana (painel "Evolução Dinâmica" mostra cada ação sobre as séries de desempenho).
  await fetch(`${CFG.grafanaUrl}/api/annotations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Basic ' + Buffer.from(`${CFG.grafanaUsuario}:${CFG.grafanaSenha}`).toString('base64'),
    },
    body: JSON.stringify({ time: Date.now(), tags: ['governanca', acao], text: `${acao}: ${JSON.stringify(detalhes)}` }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined); // melhor esforço
}

// ---------------------------------------------------------------- regras
let canal: Canal;

async function regraEstrategia(agora: number): Promise<void> {
  const lat = await consultar(
    'sum(rate(cinebridge_recomendacao_duracao_segundos_sum{estrategia="PRINCIPAL"}[2m])) / sum(rate(cinebridge_recomendacao_duracao_segundos_count{estrategia="PRINCIPAL"}[2m]))',
  );
  if (estado.estrategia === 'PRINCIPAL') {
    const duracao = latenciaAlta.atualizar(lat !== null && lat > CFG.latenciaLimiteS, agora);
    violando.set({ regra: 'latencia_recomendador' }, duracao);
    if (duracao >= CFG.latenciaJanelaS) {
      await publicarConfig(canal, 'api.estrategia', { tipo: 'ESTRATEGIA', valor: 'ORCAMENTO' });
      estado.estrategia = 'ORCAMENTO';
      estado.estrategiaDesde = agora;
      latenciaAlta.zerar();
      await auditar('TROCA_ESTRATEGIA', {
        de: 'PRINCIPAL',
        para: 'ORCAMENTO',
        motivo: `latência média ${lat?.toFixed(2)}s acima de ${CFG.latenciaLimiteS}s por ${Math.round(duracao)}s`,
      });
    }
  } else if (agora - estado.estrategiaDesde >= CFG.reversaoS) {
    // Período de prova: volta à principal; se continuar lenta, a regra acima troca novamente.
    await publicarConfig(canal, 'api.estrategia', { tipo: 'ESTRATEGIA', valor: 'PRINCIPAL' });
    estado.estrategia = 'PRINCIPAL';
    estado.estrategiaDesde = agora;
    await auditar('TROCA_ESTRATEGIA', { de: 'ORCAMENTO', para: 'PRINCIPAL', motivo: `reavaliação após ${CFG.reversaoS}s` });
  }
}

async function regraCache(agora: number): Promise<void> {
  const amostra = await consultar('sum(increase(cinebridge_cache_consultas_total[5m]))');
  const taxa = await consultar(
    'sum(increase(cinebridge_cache_consultas_total{resultado="acerto"}[5m])) / sum(increase(cinebridge_cache_consultas_total[5m]))',
  );
  if (taxa === null || (amostra ?? 0) < CFG.cacheAmostraMin) return;
  if (agora - estado.cacheUltimoAjuste < CFG.cacheCooldownS) return; // deixa a métrica refletir o ajuste anterior

  const anterior = { ttlSeg: estado.cacheTtlSeg, tamanhoMax: estado.cacheTamanhoMax };
  if (taxa < CFG.cacheAcertoMin && (estado.cacheTtlSeg < CFG.ttlMax || estado.cacheTamanhoMax < CFG.tamanhoMax)) {
    estado.cacheTtlSeg = Math.min(estado.cacheTtlSeg * 2, CFG.ttlMax);
    estado.cacheTamanhoMax = Math.min(estado.cacheTamanhoMax * 2, CFG.tamanhoMax);
  } else if (taxa > CFG.cacheAcertoMax && estado.cacheTtlSeg > CFG.ttlMin) {
    estado.cacheTtlSeg = Math.max(Math.floor(estado.cacheTtlSeg / 2), CFG.ttlMin);
  } else return;

  estado.cacheUltimoAjuste = agora;
  await publicarConfig(canal, 'api.cache', { tipo: 'CACHE', ttlSeg: estado.cacheTtlSeg, tamanhoMax: estado.cacheTamanhoMax });
  await auditar('AJUSTE_CACHE', {
    taxaAcerto: Number(taxa.toFixed(3)),
    de: anterior,
    para: { ttlSeg: estado.cacheTtlSeg, tamanhoMax: estado.cacheTamanhoMax },
  });
}

async function regraEscalonamento(agora: number): Promise<void> {
  for (const servico of CFG.servicosEscalaveis) {
    const cpu = await consultar(`avg(rate(cinebridge_process_cpu_seconds_total{servico="${servico}"}[1m])) * 100`);
    const extras = (await docker.replicas(servico)).length;
    replicasGauge.set({ servico }, extras);
    const alta = sust(cpuAlta, servico).atualizar(cpu !== null && cpu > CFG.cpuAltoPct, agora);
    const baixa = sust(cpuBaixa, servico).atualizar(cpu !== null && cpu < CFG.cpuBaixoPct, agora);
    violando.set({ regra: `cpu_alta_${servico}` }, alta);

    if (alta >= CFG.cpuJanelaS && extras + 1 < CFG.replicasMax) {
      const nome = await docker.iniciarReplica(servico);
      sust(cpuAlta, servico).zerar();
      await auditar('ESCALA_PARA_CIMA', { servico, novoContainer: nome, cpuMediaPct: Number(cpu?.toFixed(1)), replicas: extras + 2 });
    } else if (baixa >= CFG.cpuJanelaS && extras > 0) {
      const nome = await docker.removerReplica(servico);
      sust(cpuBaixa, servico).zerar();
      if (nome) await auditar('ESCALA_PARA_BAIXO', { servico, containerRemovido: nome, cpuMediaPct: Number(cpu?.toFixed(1)), replicas: extras });
    }
  }
}

async function regraVolumes(agora: number): Promise<void> {
  if (agora - estado.volumesUltimaLeitura < CFG.intervaloVolumesS) return;
  estado.volumesUltimaLeitura = agora;
  const tamanhos = await docker.tamanhosVolumes();
  const mb = (sufixo: string): number | null => {
    for (const [nome, bytes] of tamanhos) if (nome.endsWith(sufixo)) return bytes / 1024 / 1024;
    return null;
  };
  for (const v of ['loki-data', 'jaeger-data', 'prometheus-data', 'governanca-data']) {
    const m = mb(v);
    if (m !== null) volumeBytes.set({ volume: v }, m * 1024 * 1024);
  }

  // Logs: acima do limite, apaga entradas antigas no Loki (rotação por crescimento de volume).
  const loki = mb('loki-data');
  if (loki !== null && loki > CFG.limiteLokiMb && agora - estado.lokiUltimaLimpeza > 3600) {
    const fim = Math.floor(agora - CFG.logsMantidosH * 3600);
    const r = await fetch(`${CFG.lokiUrl}/loki/api/v1/delete?query=${encodeURIComponent('{container=~".+"}')}&start=0&end=${fim}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    });
    estado.lokiUltimaLimpeza = agora;
    await auditar('ROTACAO_LOGS', { volumeMb: Math.round(loki), limiteMb: CFG.limiteLokiMb, manterHoras: CFG.logsMantidosH, httpStatus: r.status });
  }

  // Traces: acima do limite, reduz a amostragem; com folga, restaura gradualmente.
  const jaeger = mb('jaeger-data');
  if (jaeger === null) return;
  let nova = estado.amostragem;
  if (jaeger > CFG.limiteJaegerMb && estado.amostragem > 0.1) nova = Math.max(estado.amostragem / 2, 0.1);
  else if (jaeger < CFG.limiteJaegerMb * 0.5 && estado.amostragem < 1) nova = Math.min(estado.amostragem * 2, 1);
  if (nova !== estado.amostragem) {
    const anterior = estado.amostragem;
    estado.amostragem = nova;
    await publicarConfig(canal, 'todos.amostragem', { tipo: 'AMOSTRAGEM', razao: nova });
    await auditar('COMPACTACAO_TRACES', { volumeMb: Math.round(jaeger), limiteMb: CFG.limiteJaegerMb, amostragemDe: anterior, amostragemPara: nova });
  }
}

/** Reenvia o estado vigente: serviços que reiniciaram voltam à configuração decidida pela governança. */
async function reafirmar(): Promise<void> {
  await publicarConfig(canal, 'api.estrategia', { tipo: 'ESTRATEGIA', valor: estado.estrategia, reafirmar: true });
  await publicarConfig(canal, 'api.cache', { tipo: 'CACHE', ttlSeg: estado.cacheTtlSeg, tamanhoMax: estado.cacheTamanhoMax, reafirmar: true });
  await publicarConfig(canal, 'todos.amostragem', { tipo: 'AMOSTRAGEM', razao: estado.amostragem, reafirmar: true });
}

let ultimoReafirmar = 0;
async function ciclo(): Promise<void> {
  const agora = Date.now() / 1000;
  ciclos.inc();
  for (const [nome, regra] of [
    ['estrategia', regraEstrategia],
    ['cache', regraCache],
    ...(DOCKER_HABILITADO ? ([['escalonamento', regraEscalonamento], ['volumes', regraVolumes]] as const) : []),
  ] as const) {
    try {
      await regra(agora);
    } catch (e) {
      logger.warn({ regra: nome, erro: (e as Error).message }, 'regra não pôde ser avaliada neste ciclo');
    }
  }
  if (agora - ultimoReafirmar >= 60) {
    ultimoReafirmar = agora;
    await reafirmar().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  validarAmbiente(['ADMIN_TOKEN']);
  if (!DOCKER_HABILITADO) logger.warn('Docker indisponível por configuração: escalonamento horizontal e rotação por volume DESATIVADOS (demais regras ativas)');
  await mkdir(dirname(CFG.arquivoAuditoria), { recursive: true }).catch(() => undefined);
  const conexao = await conectar();
  canal = await criarCanal(conexao);

  const app = Fastify({ loggerInstance: logger, disableRequestLogging: true });
  instrumentarFastify(app);
  app.get('/health', async (_req, reply) =>
    reply.code(mqSaudavel() ? 200 : 503).send({ status: mqSaudavel() ? 'ok' : 'degradado', mq: mqSaudavel() }),
  );
  app.get('/estado', { preHandler: exigirAdmin }, async () => ({ estado, limiares: CFG, dockerHabilitado: DOCKER_HABILITADO }));

  // Trilha de auditoria (mais recentes primeiro) para o Control Center.
  app.get<{ Querystring: { limite?: string } }>('/auditoria', { preHandler: exigirAdmin }, async (req) => {
    const limite = Math.min(Math.max(Number(req.query.limite ?? 50) || 50, 1), 500);
    const texto = await readFile(CFG.arquivoAuditoria, 'utf-8').catch(() => '');
    return texto
      .split('\n')
      .filter(Boolean)
      .slice(-limite)
      .reverse()
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return { acao: 'LINHA_INVALIDA', bruto: l };
        }
      });
  });

  // Intervenção manual do operador (autenticada e auditada). As regras automáticas continuam valendo depois dela.
  app.post<{ Body: { valor?: string; operador?: string } }>('/acoes/estrategia', { preHandler: exigirAdmin }, async (req, reply) => {
    const valor = req.body?.valor;
    if (valor !== 'PRINCIPAL' && valor !== 'ORCAMENTO') return reply.code(400).send({ erro: 'valor deve ser PRINCIPAL ou ORCAMENTO' });
    const de = estado.estrategia;
    if (de === valor) return { estrategia: valor, alterada: false };
    await publicarConfig(canal, 'api.estrategia', { tipo: 'ESTRATEGIA', valor });
    estado.estrategia = valor;
    estado.estrategiaDesde = Date.now() / 1000;
    latenciaAlta.zerar();
    await auditar('TROCA_ESTRATEGIA_MANUAL', { de, para: valor, operador: String(req.body?.operador ?? 'desconhecido').slice(0, 64) });
    return { estrategia: valor, alterada: true };
  });
  await app.listen({ port: PORTA, host: '0.0.0.0' });

  logger.info({ limiares: CFG }, 'governança iniciada');
  await reafirmar();
  const timer = setInterval(() => void ciclo(), CFG.intervaloS * 1000);

  process.on('SIGTERM', () => {
    clearInterval(timer);
    // Réplicas criadas dinamicamente não pertencem ao compose: removê-las evita containers órfãos no `down`.
    (DOCKER_HABILITADO ? docker.removerTodasReplicas(CFG.servicosEscalaveis) : Promise.resolve())
      .catch(() => undefined)
      .then(() => encerrar())
      .finally(() => process.exit(0));
  });
}

main().catch((e) => {
  logger.fatal(e);
  process.exit(1);
});
