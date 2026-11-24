import Fastify from 'fastify';
import { pool, bancoSaudavel } from './db';
import { conectar, criarCanal, consumir, assinarConfig, mqSaudavel, FILAS } from './mq';
import { registrarTratamentoDeErros } from './seguranca';
import { logger, instrumentarFastify, client, encerrar, definirAmostragem } from './obs';

const PORTA = Number(process.env.PORT ?? 3003);

const entregas = new client.Counter({
  name: 'cinebridge_notificacoes_total',
  help: 'Notificações por canal e resultado da entrega',
  labelNames: ['canal', 'resultado'],
});
const CANAIS = ['email', 'push'] as const;
// Envio simulado: percentual de falhas configurável (para exercitar o painel de entrega).
const FALHA_SIMULADA_PCT = Number(process.env.FALHA_SIMULADA_PCT ?? 3);

type TipoEvento = 'PROJETO_CRIADO' | 'PROJETO_ATUALIZADO' | 'PROJETO_FINALIZADO';

interface EventoProjeto {
  tipo: TipoEvento;
  projetoId: string;
  titulo: string;
  tamanhoEquipe: number;
  ocorridoEm: string;
}

// ---- Padrão Observer: cada observador reage a um tipo de evento, sem conhecer os demais ----
interface Observador {
  tratar(evento: EventoProjeto): Promise<void>;
}

class BarramentoEventos {
  private readonly observadores = new Map<TipoEvento, Observador[]>();

  inscrever(tipo: TipoEvento, observador: Observador): void {
    this.observadores.set(tipo, [...(this.observadores.get(tipo) ?? []), observador]);
  }

  async publicar(evento: EventoProjeto): Promise<void> {
    for (const o of this.observadores.get(evento.tipo) ?? []) await o.tratar(evento);
  }
}

class EnvioNotificacao implements Observador {
  constructor(private readonly montar: (e: EventoProjeto) => { assunto: string; mensagem: string }) {}

  async tratar(evento: EventoProjeto): Promise<void> {
    const { assunto, mensagem } = this.montar(evento);
    await pool.query(
      'insert into notificacoes (tipo, assunto, mensagem, evento) values ($1,$2,$3,$4)',
      [evento.tipo, assunto, mensagem, JSON.stringify(evento)],
    );
    // Envio simulado por canal: em produção, trocar pelos provedores reais de e-mail/push.
    for (const canal of CANAIS) {
      const falhou = Math.random() * 100 < FALHA_SIMULADA_PCT;
      entregas.inc({ canal, resultado: falhou ? 'falha' : 'entregue' });
      if (falhou) logger.warn({ canal, tipo: evento.tipo }, '[notificação] falha simulada de entrega');
    }
    logger.info({ tipo: evento.tipo, projetoId: evento.projetoId }, `[notificação] ${assunto}`);
  }
}

const barramento = new BarramentoEventos();
barramento.inscrever(
  'PROJETO_CRIADO',
  new EnvioNotificacao((e) => ({
    assunto: `Projeto criado: ${e.titulo}`,
    mensagem: `Equipe recomendada com ${e.tamanhoEquipe} profissional(is) para o projeto ${e.projetoId}.`,
  })),
);
barramento.inscrever(
  'PROJETO_ATUALIZADO',
  new EnvioNotificacao((e) => ({
    assunto: `Projeto atualizado: ${e.titulo}`,
    mensagem: `O projeto ${e.projetoId} foi atualizado.`,
  })),
);
barramento.inscrever(
  'PROJETO_FINALIZADO',
  new EnvioNotificacao((e) => ({
    assunto: `Projeto finalizado: ${e.titulo}`,
    mensagem: `O projeto ${e.projetoId} foi finalizado.`,
  })),
);

async function iniciarBanco(): Promise<void> {
  await pool.query(`
    create table if not exists notificacoes (
      id uuid primary key default gen_random_uuid(),
      tipo text not null,
      assunto text not null,
      mensagem text not null,
      evento jsonb not null,
      criado_em timestamptz not null default now()
    )`);
}

async function main(): Promise<void> {
  process.on('SIGTERM', () => void encerrar().finally(() => process.exit(0)));
  await iniciarBanco();

  const conexao = await conectar();
  const canal = await criarCanal(conexao);
  await assinarConfig(canal, ['notificacoes.#', 'todos.#'], (m) => {
    if (m.tipo === 'AMOSTRAGEM' && typeof m.razao === 'number') definirAmostragem(m.razao);
  });
  await consumir<EventoProjeto>(canal, FILAS.eventosProjetos, (evento) => barramento.publicar(evento));

  const app = Fastify({ loggerInstance: logger, disableRequestLogging: true });
  instrumentarFastify(app);
  registrarTratamentoDeErros(app);

  app.get('/health', async (_req, reply) => {
    const db = await bancoSaudavel();
    const mq = mqSaudavel();
    return reply.code(db && mq ? 200 : 503).send({ status: db && mq ? 'ok' : 'degradado', db, mq });
  });

  app.get('/notificacoes', async () => {
    const { rows } = await pool.query(
      'select id, tipo, assunto, mensagem, criado_em as "criadoEm" from notificacoes order by criado_em desc limit 50',
    );
    return rows;
  });

  await app.listen({ port: PORTA, host: '0.0.0.0' });
}

main().catch((e) => {
  logger.fatal(e);
  process.exit(1);
});
