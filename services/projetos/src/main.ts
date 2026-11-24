import Fastify from 'fastify';
import { pool, bancoSaudavel } from './db';
import { conectar, criarCanal, consumir, publicar, responder, assinarConfig, mqSaudavel, Canal, FILAS } from './mq';
import { registrarTratamentoDeErros } from './seguranca';
import { logger, instrumentarFastify, client, encerrar, definirAmostragem } from './obs';

const PORTA = Number(process.env.PORT ?? 3002);

const COLUNAS = `id, titulo, genero, orcamento_total::float8 as "orcamentoTotal", status, equipe, criado_em as "criadoEm"`;

interface NovoProjeto {
  titulo: string;
  orcamentoTotal: number;
  equipe?: unknown[];
  genero?: string;
}

// ---- métricas de domínio ----
new client.Gauge({
  name: 'cinebridge_projetos_ativos',
  help: 'Projetos ativos (não finalizados) por gênero',
  labelNames: ['genero'],
  async collect() {
    const { rows } = await pool.query("select genero, count(*)::int as n from projetos where status <> 'FINALIZADO' group by genero");
    this.reset();
    for (const r of rows) this.set({ genero: r.genero }, r.n);
  },
});
new client.Gauge({
  name: 'cinebridge_projetos_por_status',
  help: 'Projetos por status',
  labelNames: ['status'],
  async collect() {
    const { rows } = await pool.query('select status, count(*)::int as n from projetos group by status');
    this.reset();
    for (const r of rows) this.set({ status: r.status }, r.n);
  },
});
const convites = new client.Counter({
  name: 'cinebridge_convites_total',
  help: 'Respostas a convites enviados a profissionais',
  labelNames: ['resultado'],
});

async function iniciarBanco(): Promise<void> {
  await pool.query(`
    create table if not exists projetos (
      id uuid primary key default gen_random_uuid(),
      titulo text not null,
      orcamento_total numeric(14,2) not null,
      status text not null default 'CRIADO',
      equipe jsonb not null default '[]',
      criado_em timestamptz not null default now()
    )`);
  await pool.query("alter table projetos add column if not exists genero text not null default 'NAO_INFORMADO'");
}

async function main(): Promise<void> {
  process.on('SIGTERM', () => void encerrar().finally(() => process.exit(0)));
  await iniciarBanco();

  const conexao = await conectar();
  const canalPub: Canal = await criarCanal(conexao);
  const canalSub: Canal = await criarCanal(conexao);
  await assinarConfig(canalSub, ['projetos.#', 'todos.#'], (m) => {
    if (m.tipo === 'AMOSTRAGEM' && typeof m.razao === 'number') definirAmostragem(m.razao);
  });

  async function emitirEvento(tipo: string, projeto: { id: string; titulo: string; equipe?: unknown[] }) {
    await publicar(canalPub, FILAS.eventosProjetos, {
      tipo,
      projetoId: projeto.id,
      titulo: projeto.titulo,
      tamanhoEquipe: projeto.equipe?.length ?? 0,
      ocorridoEm: new Date().toISOString(),
    });
  }

  async function criarProjeto(p: NovoProjeto) {
    const { rows } = await pool.query(
      `insert into projetos (titulo, orcamento_total, equipe, genero) values ($1,$2,$3,$4) returning ${COLUNAS}`,
      [p.titulo, p.orcamentoTotal, JSON.stringify(p.equipe ?? []), (p.genero ?? 'NAO_INFORMADO').toUpperCase()],
    );
    await emitirEvento('PROJETO_CRIADO', rows[0]);
    return rows[0];
  }

  // Consumidor: a API registra o projeto recomendado por mensagem (sem chamada HTTP direta).
  await consumir<NovoProjeto>(canalSub, FILAS.registroProjetos, async (msg, bruto) => {
    try {
      const projeto = await criarProjeto(msg);
      responder(canalSub, bruto, { projetoId: projeto.id });
    } catch (e) {
      logger.error({ erro: (e as Error).message }, '[registro] erro');
      responder(canalSub, bruto, { erro: 'falha ao registrar projeto' });
    }
  });

  const app = Fastify({ loggerInstance: logger, disableRequestLogging: true });
  instrumentarFastify(app);
  registrarTratamentoDeErros(app);

  app.get('/health', async (_req, reply) => {
    const db = await bancoSaudavel();
    const mq = mqSaudavel();
    return reply.code(db && mq ? 200 : 503).send({ status: db && mq ? 'ok' : 'degradado', db, mq });
  });

  app.get('/projetos', async () => (await pool.query(`select ${COLUNAS} from projetos order by criado_em desc`)).rows);

  app.get<{ Params: { id: string } }>('/projetos/:id', async (req, reply) => {
    const { rows } = await pool.query(`select ${COLUNAS} from projetos where id = $1`, [req.params.id]);
    return rows[0] ?? reply.code(404).send({ erro: 'projeto não encontrado' });
  });

  app.post<{ Body: Partial<NovoProjeto> }>('/projetos', async (req, reply) => {
    const { titulo, orcamentoTotal, equipe, genero } = req.body ?? {};
    if (!titulo || typeof orcamentoTotal !== 'number') {
      return reply.code(400).send({ erro: 'titulo e orcamentoTotal são obrigatórios' });
    }
    return reply.code(201).send(await criarProjeto({ titulo, orcamentoTotal, equipe, genero }));
  });

  // Resposta de um profissional a um convite (alimenta a taxa de aceitação do painel de negócio).
  app.post<{ Params: { id: string; profissionalId: string }; Body: { aceito?: boolean } }>(
    '/projetos/:id/convites/:profissionalId',
    async (req, reply) => {
      if (typeof req.body?.aceito !== 'boolean') return reply.code(400).send({ erro: 'aceito (boolean) é obrigatório' });
      const { rows } = await pool.query('select 1 from projetos where id = $1', [req.params.id]);
      if (!rows[0]) return reply.code(404).send({ erro: 'projeto não encontrado' });
      convites.inc({ resultado: req.body.aceito ? 'aceito' : 'recusado' });
      return reply.code(202).send({ projetoId: req.params.id, profissionalId: req.params.profissionalId, aceito: req.body.aceito });
    },
  );

  app.patch<{ Params: { id: string }; Body: { titulo?: string; status?: 'EM_ANDAMENTO' | 'FINALIZADO' } }>(
    '/projetos/:id',
    async (req, reply) => {
      const { titulo, status } = req.body ?? {};
      if (status && !['EM_ANDAMENTO', 'FINALIZADO'].includes(status)) {
        return reply.code(400).send({ erro: 'status deve ser EM_ANDAMENTO ou FINALIZADO' });
      }
      const { rows } = await pool.query(
        `update projetos set titulo = coalesce($2, titulo), status = coalesce($3, status)
         where id = $1 returning ${COLUNAS}`,
        [req.params.id, titulo ?? null, status ?? null],
      );
      if (!rows[0]) return reply.code(404).send({ erro: 'projeto não encontrado' });
      await emitirEvento(status === 'FINALIZADO' ? 'PROJETO_FINALIZADO' : 'PROJETO_ATUALIZADO', rows[0]);
      return rows[0];
    },
  );

  await app.listen({ port: PORTA, host: '0.0.0.0' });
}

main().catch((e) => {
  logger.fatal(e);
  process.exit(1);
});
