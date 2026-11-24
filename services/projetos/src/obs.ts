/**
 * Observabilidade (ATVV): métricas Prometheus, logs JSON estruturados e rastreamento distribuído.
 * Este arquivo é idêntico em todos os serviços; configuração por variáveis de ambiente.
 */
import pino from 'pino';
import client from '@prometheus-io/client';
import type { FastifyInstance } from 'fastify';
import {
  context,
  propagation,
  trace,
  SpanKind,
  SpanStatusCode,
  ROOT_CONTEXT,
  type Attributes,
  type Context,
  type Link,
  type Span,
} from '@opentelemetry/api';
import {
  NodeTracerProvider,
  BatchSpanProcessor,
  TraceIdRatioBasedSampler,
  SamplingDecision,
  type Sampler,
  type SamplingResult,
} from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';

export const SERVICO = process.env.SERVICO_NOME ?? 'desconhecido';
export const INSTANCIA = process.env.HOSTNAME ?? SERVICO;

// ---------------------------------------------------------------- logs (pino, JSON em stdout)
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { servico: SERVICO, instancia: INSTANCIA },
  messageKey: 'mensagem',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: { level: (nivel) => ({ nivel }) },
  // Todo log emitido dentro de um span carrega o identificador de correlação (= trace id).
  mixin() {
    const sc = trace.getActiveSpan()?.spanContext();
    return sc ? { correlationId: sc.traceId, spanId: sc.spanId } : {};
  },
});

// ---------------------------------------------------------------- métricas (@prometheus-io/client)
client.collectDefaultMetrics({ prefix: 'cinebridge_' });
export { client };

export const requisicoes = new client.Counter({
  name: 'cinebridge_http_requests_total',
  help: 'Requisições HTTP recebidas',
  labelNames: ['metodo', 'rota', 'status'],
});
export const duracaoHttp = new client.Histogram({
  name: 'cinebridge_http_request_duration_seconds',
  help: 'Tempo de resposta por rota',
  labelNames: ['metodo', 'rota', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
const tamanhoBuckets = [100, 500, 1e3, 5e3, 1e4, 5e4, 1e5, 5e5, 1e6];
export const tamanhoReq = new client.Histogram({
  name: 'cinebridge_http_request_size_bytes',
  help: 'Tamanho do payload recebido',
  labelNames: ['rota'],
  buckets: tamanhoBuckets,
});
export const tamanhoResp = new client.Histogram({
  name: 'cinebridge_http_response_size_bytes',
  help: 'Tamanho do payload enviado',
  labelNames: ['rota'],
  buckets: tamanhoBuckets,
});
export const mqMensagens = new client.Counter({
  name: 'cinebridge_mq_mensagens_total',
  help: 'Mensagens RabbitMQ publicadas/consumidas',
  labelNames: ['fila', 'direcao', 'resultado'],
});
export const mqProcessamento = new client.Histogram({
  name: 'cinebridge_mq_processamento_segundos',
  help: 'Tempo de processamento de mensagens consumidas',
  labelNames: ['fila'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5],
});
const gaugeAmostragem = new client.Gauge({
  name: 'cinebridge_config_amostragem_traces',
  help: 'Fração de traces amostrados (ajustada pela governança)',
});

// ---------------------------------------------------------------- rastreamento (OpenTelemetry)
/** Amostrador cuja razão pode ser alterada em tempo de execução (compactação de traces). */
class AmostradorDinamico implements Sampler {
  razao = 1;
  private interno = new TraceIdRatioBasedSampler(1);
  definir(razao: number): void {
    this.razao = razao;
    this.interno = new TraceIdRatioBasedSampler(razao);
  }
  shouldSample(ctx: Context, traceId: string, _nome: string, _tipo: SpanKind, _attrs: Attributes, _links: Link[]): SamplingResult {
    const pai = trace.getSpanContext(ctx);
    if (pai && trace.isSpanContextValid(pai)) {
      // Respeita a decisão já tomada na origem da requisição.
      return { decision: pai.traceFlags & 1 ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD };
    }
    return this.interno.shouldSample(ctx, traceId);
  }
  toString(): string {
    return `AmostradorDinamico(${this.razao})`;
  }
}

const amostrador = new AmostradorDinamico();
// Endpoint vazio = traces desativados (perfil de produção sem Jaeger); contexto/correlationId continuam funcionando.
const endpointOtlp = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://cinebridge-jaeger:4318';
const provedor = new NodeTracerProvider({
  resource: resourceFromAttributes({ 'service.name': SERVICO, 'service.instance.id': INSTANCIA }),
  sampler: amostrador,
  spanProcessors: endpointOtlp ? [new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpointOtlp}/v1/traces` }))] : [],
});
provedor.register(); // contexto assíncrono + propagação W3C (traceparent)
gaugeAmostragem.set(1);

export function definirAmostragem(razao: number): void {
  const r = Math.min(1, Math.max(0, razao));
  amostrador.definir(r);
  gaugeAmostragem.set(r);
}

export async function encerrar(): Promise<void> {
  await provedor.shutdown().catch(() => undefined);
}

const tracer = trace.getTracer(SERVICO);

/** Executa `fn` dentro de um novo span (filho do contexto ativo ou de `pai`). */
export async function comSpan<T>(
  nome: string,
  opcoes: { kind?: SpanKind; atributos?: Attributes; pai?: Context },
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const pai = opcoes.pai ?? context.active();
  const span = tracer.startSpan(nome, { kind: opcoes.kind, attributes: opcoes.atributos }, pai);
  try {
    return await context.with(trace.setSpan(pai, span), () => fn(span));
  } catch (e) {
    span.recordException(e as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
    throw e;
  } finally {
    span.end();
  }
}

export { SpanKind, propagation, context, ROOT_CONTEXT, trace };

// ---------------------------------------------------------------- Fastify: spans, métricas e /metrics
export function instrumentarFastify(app: FastifyInstance<any, any, any, any, any>): void {
  const estado = new WeakMap<object, Span>();

  app.addHook('onRequest', (req, reply, done) => {
    const rota = req.routeOptions?.url ?? req.url.split('?')[0];
    if (rota === '/metrics' || rota === '/health') return done(); // ruído: sem span
    const pai = propagation.extract(ROOT_CONTEXT, req.headers);
    const span = tracer.startSpan(
      `${req.method} ${rota}`,
      { kind: SpanKind.SERVER, attributes: { 'http.method': req.method, 'http.route': rota } },
      pai,
    );
    estado.set(req, span);
    reply.header('x-correlation-id', span.spanContext().traceId);
    context.with(trace.setSpan(pai, span), done); // handler roda dentro do span
  });

  app.addHook('onResponse', (req, reply, done) => {
    const rota = req.routeOptions?.url ?? 'desconhecida';
    const span = estado.get(req);
    if (rota !== '/metrics') {
      const rotulos = { metodo: req.method, rota, status: String(reply.statusCode) };
      requisicoes.inc(rotulos);
      duracaoHttp.observe(rotulos, reply.elapsedTime / 1000);
      const entrada = Number(req.headers['content-length']);
      const saida = Number(reply.getHeader('content-length'));
      if (Number.isFinite(entrada)) tamanhoReq.observe({ rota }, entrada);
      if (Number.isFinite(saida)) tamanhoResp.observe({ rota }, saida);
    }
    if (span) {
      span.setAttribute('http.status_code', reply.statusCode);
      if (reply.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      logger.info(
        {
          correlationId: span.spanContext().traceId,
          metodo: req.method,
          rota,
          status: reply.statusCode,
          duracaoMs: Math.round(reply.elapsedTime),
        },
        'requisição concluída',
      );
    }
    done();
  });

  app.get('/metrics', async (_req, reply) =>
    reply.header('content-type', client.register.contentType).send(await client.register.metrics()),
  );
}
