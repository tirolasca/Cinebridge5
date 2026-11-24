import amqp from 'amqplib';
import type { ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { logger, comSpan, mqMensagens, mqProcessamento, propagation, context, ROOT_CONTEXT, SpanKind } from './obs';

type Conexao = Awaited<ReturnType<typeof amqp.connect>>;
export type Canal = amqp.ConfirmChannel;

export const FILAS = {
  consultaProfissionais: 'consulta-profissionais',
  registroProjetos: 'registro-projetos',
  eventosProjetos: 'eventos-projetos',
} as const;

/** Mudanças de configuração publicadas pela governança (exchange topic; fila exclusiva por instância). */
export const EXCHANGE_CONFIG = 'cinebridge.config';

let saudavel = false;
export const mqSaudavel = (): boolean => saudavel;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Conecta ao RabbitMQ com novas tentativas (o broker pode demorar a aceitar conexões). */
export async function conectar(url = process.env.RABBITMQ_URL ?? '', tentativas = 15): Promise<Conexao> {
  for (let i = 1; ; i++) {
    try {
      const conexao = await amqp.connect(url);
      conexao.on('error', (e: Error) => logger.error({ erro: e.message }, '[mq] erro de conexão'));
      conexao.on('close', () => {
        // Sem a conexão o serviço não funciona: encerra e deixa o Docker reiniciar (restart: unless-stopped).
        saudavel = false;
        logger.error('[mq] conexão encerrada; finalizando processo');
        process.exit(1);
      });
      saudavel = true;
      logger.info('[mq] conectado');
      return conexao;
    } catch (e) {
      if (i >= tentativas) throw e;
      logger.warn(`[mq] tentativa ${i}/${tentativas} falhou; nova tentativa em 2s`);
      await dormir(2000);
    }
  }
}

export async function criarCanal(conexao: Conexao): Promise<Canal> {
  const canal = await conexao.createConfirmChannel();
  canal.on('error', (e: Error) => logger.error({ erro: e.message }, '[mq] erro de canal'));
  return canal;
}

/** Publica JSON em uma fila durável, aguardando a confirmação do broker. Propaga o trace nos headers. */
export async function publicar(
  canal: Canal,
  fila: string,
  mensagem: unknown,
  opcoes: amqp.Options.Publish = {},
): Promise<void> {
  await comSpan(`publicar ${fila}`, { kind: SpanKind.PRODUCER, atributos: { 'messaging.destination': fila } }, async () => {
    const headers: Record<string, string> = {};
    propagation.inject(context.active(), headers);
    await canal.assertQueue(fila, { durable: true });
    try {
      await new Promise<void>((resolve, reject) => {
        canal.sendToQueue(
          fila,
          Buffer.from(JSON.stringify(mensagem)),
          { persistent: true, contentType: 'application/json', ...opcoes, headers: { ...opcoes.headers, ...headers } },
          (err) => (err ? reject(err) : resolve()),
        );
      });
      mqMensagens.inc({ fila, direcao: 'publicada', resultado: 'ok' });
    } catch (e) {
      mqMensagens.inc({ fila, direcao: 'publicada', resultado: 'erro' });
      throw e;
    }
  });
}

/** Consome JSON de uma fila durável com confirmação manual (ack após o processamento). */
export async function consumir<T>(
  canal: Canal,
  fila: string,
  tratar: (mensagem: T, bruto: ConsumeMessage) => Promise<void>,
  prefetch = 10,
): Promise<void> {
  await canal.assertQueue(fila, { durable: true });
  await canal.prefetch(prefetch);
  await canal.consume(fila, async (bruto) => {
    if (!bruto) return;
    const pai = propagation.extract(ROOT_CONTEXT, bruto.properties.headers ?? {});
    const fim = mqProcessamento.startTimer({ fila });
    try {
      await comSpan(`consumir ${fila}`, { kind: SpanKind.CONSUMER, pai, atributos: { 'messaging.source': fila } }, () =>
        tratar(JSON.parse(bruto.content.toString()) as T, bruto),
      );
      canal.ack(bruto);
      mqMensagens.inc({ fila, direcao: 'consumida', resultado: 'ok' });
    } catch (e) {
      logger.error({ fila, erro: (e as Error).message }, '[mq] falha ao processar mensagem');
      mqMensagens.inc({ fila, direcao: 'consumida', resultado: 'erro' });
      canal.nack(bruto, false, false); // descarta (não reenfileira) para evitar laço infinito
    } finally {
      fim();
    }
  });
  logger.info(`[mq] consumindo ${fila}`);
}

/** Responde a uma requisição RPC na fila de retorno indicada pelo remetente. */
export function responder(canal: Canal, bruto: ConsumeMessage, corpo: unknown): void {
  const { replyTo, correlationId } = bruto.properties;
  if (!replyTo) return;
  canal.sendToQueue(replyTo, Buffer.from(JSON.stringify(corpo)), {
    correlationId,
    contentType: 'application/json',
  });
}

/**
 * Requisição/resposta sobre filas: publica em `fila` e aguarda a resposta em uma fila de
 * retorno exclusiva, criada com nome único para cada requisição.
 */
export async function rpcCall<T>(canal: Canal, fila: string, payload: unknown, timeoutMs = 5000): Promise<T> {
  return comSpan(`rpc ${fila}`, { kind: SpanKind.CLIENT, atributos: { 'rpc.destination': fila } }, async () => {
    const { queue: replyTo } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
    const correlationId = randomUUID();
    let consumerTag = '';
    let timer: NodeJS.Timeout | undefined;

    const resposta = new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`RPC em ${fila}: tempo esgotado (${timeoutMs}ms)`)), timeoutMs);
      canal
        .consume(
          replyTo,
          (msg) => {
            if (!msg || msg.properties.correlationId !== correlationId) return;
            const corpo = JSON.parse(msg.content.toString());
            if (corpo && corpo.erro) reject(new Error(String(corpo.erro)));
            else resolve(corpo as T);
          },
          { noAck: true },
        )
        .then((r) => {
          consumerTag = r.consumerTag;
        })
        .catch(reject);
    });

    try {
      await publicar(canal, fila, payload, {
        replyTo,
        correlationId,
        persistent: false,
        expiration: String(timeoutMs), // requisição expirada não deve acumular na fila
      });
      return await resposta;
    } finally {
      if (timer) clearTimeout(timer);
      if (consumerTag) canal.cancel(consumerTag).catch(() => undefined);
    }
  });
}

// ------------------------------------------------------------ configuração dinâmica (governança)
/** Publica uma mensagem de configuração. Chave: `<servico>.<assunto>` ou `todos.<assunto>`. */
export async function publicarConfig(canal: Canal, chave: string, mensagem: unknown): Promise<void> {
  await canal.assertExchange(EXCHANGE_CONFIG, 'topic', { durable: true });
  await new Promise<void>((resolve, reject) => {
    canal.publish(
      EXCHANGE_CONFIG,
      chave,
      Buffer.from(JSON.stringify(mensagem)),
      { contentType: 'application/json', persistent: false },
      (err) => (err ? reject(err) : resolve()),
    );
  });
  mqMensagens.inc({ fila: `config:${chave}`, direcao: 'publicada', resultado: 'ok' });
}

/** Assina mudanças de configuração. Cada instância (réplica) recebe sua própria cópia da mensagem. */
export async function assinarConfig(
  canal: Canal,
  chaves: string[],
  tratar: (mensagem: Record<string, unknown>, chave: string) => void,
): Promise<void> {
  await canal.assertExchange(EXCHANGE_CONFIG, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
  for (const chave of chaves) await canal.bindQueue(queue, EXCHANGE_CONFIG, chave);
  await canal.consume(
    queue,
    (msg) => {
      if (!msg) return;
      try {
        tratar(JSON.parse(msg.content.toString()), msg.fields.routingKey);
      } catch (e) {
        logger.error({ erro: (e as Error).message }, '[config] mensagem inválida');
      }
    },
    { noAck: true },
  );
  logger.info({ chaves }, '[config] assinatura ativa');
}
