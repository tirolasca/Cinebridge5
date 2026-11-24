import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from './obs';

/** AMBIENTE=producao ativa validações rígidas (segredos obrigatórios, recursos de demonstração proibidos). */
export const emProducao = (): boolean => process.env.AMBIENTE === 'producao';

/** Falha na inicialização se faltar configuração obrigatória em produção. */
export function validarAmbiente(obrigatorias: string[] = []): void {
  if (!emProducao()) return;
  const problemas: string[] = [];
  for (const nome of obrigatorias) if (!process.env[nome]) problemas.push(`${nome} não definida`);
  const token = process.env.ADMIN_TOKEN;
  if (obrigatorias.includes('ADMIN_TOKEN') && token && token.length < 24) problemas.push('ADMIN_TOKEN deve ter ao menos 24 caracteres');
  if (process.env.HABILITAR_SIMULACAO === 'true') problemas.push('HABILITAR_SIMULACAO=true é proibido em produção');
  if (problemas.length) {
    logger.fatal({ problemas }, 'configuração de produção inválida');
    throw new Error(`Configuração de produção inválida: ${problemas.join('; ')}`);
  }
}

/**
 * preHandler de autorização administrativa (token Bearer, comparação em tempo constante).
 * Sem ADMIN_TOKEN: liberado apenas fora de produção (conveniência local); em produção responde 503.
 */
export async function exigirAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const esperado = process.env.ADMIN_TOKEN;
  if (!esperado) {
    if (emProducao()) await reply.code(503).send({ erro: 'autenticação administrativa não configurada' });
    return;
  }
  const recebido = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) await reply.code(401).send({ erro: 'não autorizado' });
}

/** Erros 5xx não vazam detalhes internos; 4xx mantêm a mensagem de validação. */
export function registrarTratamentoDeErros(app: FastifyInstance<any, any, any, any, any>): void {
  app.setErrorHandler((err, req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      req.log.error(err);
      return reply.code(500).send({ erro: 'erro interno' });
    }
    return reply.code(status).send({ erro: (err as Error).message });
  });
}

export const origensCors = (): string[] =>
  (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
