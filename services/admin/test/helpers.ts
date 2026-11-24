import './setup';
import Fastify, { type FastifyInstance } from 'fastify';
import { carregarConfig, type Config } from '../src/config';
import { construirApp, type AppCriado } from '../src/app';
import { hashSenha } from '../src/senha';

export const USUARIO = 'admin';
export const SENHA = 'senha-de-teste-123';
export const UUID1 = '11111111-1111-4111-8111-111111111111';
export const UUID2 = '22222222-2222-4222-8222-222222222222';

export interface Chamada {
  metodo: string;
  url: string;
  corpo: unknown;
  auth?: string;
}

/** Sobe um "serviço interno" falso (HTTP real em porta efêmera) que registra as chamadas recebidas. */
export async function falso(rotas: (app: FastifyInstance, chamadas: Chamada[]) => void): Promise<{ url: string; chamadas: Chamada[]; fechar: () => Promise<void> }> {
  const app = Fastify();
  const chamadas: Chamada[] = [];
  app.addHook('onRequest', async (req) => {
    chamadas.push({ metodo: req.method, url: req.url, corpo: undefined, auth: req.headers.authorization });
  });
  app.addHook('preHandler', async (req) => {
    chamadas[chamadas.length - 1]!.corpo = req.body;
  });
  rotas(app, chamadas);
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  return { url, chamadas, fechar: () => app.close() };
}

export interface Ambiente {
  criado: AppCriado;
  cfg: Config;
  falsos: Record<string, Awaited<ReturnType<typeof falso>>>;
  login: () => Promise<{ cookie: string; csrf: string }>;
  fechar: () => Promise<void>;
}

export async function ambiente(over: Record<string, string> = {}, prometheusOk = true): Promise<Ambiente> {
  const saude = (a: FastifyInstance) => a.get('/health', async () => ({ status: 'ok' }));
  const falsos = {
    api: await falso((a) => {
      saude(a);
      a.post('/projetos/recomendacao', async (_r, rep) => rep.code(201).send({ projetoId: UUID1, estrategia: 'PRINCIPAL' }));
      a.get('/recomendacoes', async () => [{ id: 1 }]);
      a.get('/config', async () => ({ estrategia: 'PRINCIPAL', cacheTtlSeg: 30 }));
    }),
    profissionais: await falso((a) => {
      saude(a);
      a.get('/profissionais', async () => [{ id: UUID1, nome: 'Ana', papel: 'DIRETOR' }]);
      a.post('/profissionais', async (_r, rep) => rep.code(201).send({ id: UUID2 }));
    }),
    projetos: await falso((a) => {
      saude(a);
      a.get('/projetos', async () => [{ id: UUID1, titulo: 'X', status: 'EM_ANDAMENTO' }]);
      a.get('/projetos/:id', async (r, rep) => ((r.params as { id: string }).id === UUID1 ? { id: UUID1 } : rep.code(404).send({ erro: 'projeto não encontrado' })));
      a.post('/projetos', async (_r, rep) => rep.code(400).send({ erro: 'titulo e orcamentoTotal são obrigatórios' }));
      a.patch('/projetos/:id', async () => ({ ok: true }));
      a.post('/projetos/:id/convites/:p', async (_r, rep) => rep.code(202).send({ aceito: true }));
    }),
    notificacoes: await falso((a) => {
      saude(a);
      a.get('/notificacoes', async () => [{ id: 'n1', tipo: 'PROJETO_CRIADO', assunto: 'Novo projeto', mensagem: 'm', criadoEm: '2026-11-18T10:00:00.000Z' }]);
    }),
    governanca: await falso((a) => {
      saude(a);
      a.get('/estado', async () => ({ estado: { estrategia: 'PRINCIPAL' }, limiares: {}, dockerHabilitado: false }));
      a.get('/auditoria', async () => [{ timestamp: '2026-11-18T11:00:00.000Z', acao: 'AJUSTE_CACHE', para: { ttlSeg: 60 } }]);
      a.post('/acoes/estrategia', async () => ({ estrategia: 'ORCAMENTO', alterada: true }));
    }),
    prometheus: await falso((a) => {
      a.get('/api/v1/query', async (r) => {
        if (!prometheusOk) return { status: 'error' };
        const q = String((r.query as { query: string }).query);
        if (q.includes('profissionais_total')) return { data: { result: [{ metric: {}, value: [0, '12'] }] } };
        if (q.includes('projetos_por_status')) return { data: { result: [{ metric: { status: 'EM_ANDAMENTO' }, value: [0, '3'] }, { metric: { status: 'FINALIZADO' }, value: [0, '2'] }] } };
        return { data: { result: [{ metric: { servico: 'cinebridge-api' }, value: [0, '0.25'] }] } };
      });
      a.get('/api/v1/query_range', async () => ({ data: { result: [{ values: [[1, '1'], [2, '0.8']] }] } }));
      if (!prometheusOk) a.addHook('onSend', async (_q, rep) => void rep.code(500));
    }),
    rabbit: await falso((a) => {
      a.get('/api/queues', async () => [
        { name: 'registro-projetos', state: 'running', messages: 4, messages_ready: 3, messages_unacknowledged: 1, consumers: 1, durable: true, message_stats: { publish: 10, publish_details: { rate: 1.5 }, deliver_get: 9, deliver_get_details: { rate: 1.2 }, ack: 9 } },
        { name: 'amq.gen-abc', state: 'running', messages: 0, messages_ready: 0, messages_unacknowledged: 0, consumers: 1, exclusive: true },
      ]);
    }),
  };
  const cfg = carregarConfig({
    AMBIENTE: 'local',
    ADMIN_USER: USUARIO,
    ADMIN_PASSWORD_HASH: await hashSenha(SENHA),
    ADMIN_TOKEN: 'token-interno-de-teste-1234567890',
    URL_API: falsos.api.url,
    URL_PROFISSIONAIS: falsos.profissionais.url,
    URL_PROJETOS: falsos.projetos.url,
    URL_NOTIFICACOES: falsos.notificacoes.url,
    URL_GOVERNANCA: falsos.governanca.url,
    URL_PROMETHEUS: falsos.prometheus.url,
    URL_LOKI: 'http://127.0.0.1:1',
    URL_JAEGER: 'http://127.0.0.1:1',
    RABBITMQ_MGMT_URL: falsos.rabbit.url,
    STATIC_DIR: '/inexistente',
    ...over,
  });
  const criado = await construirApp(cfg);
  const login = async () => {
    const r = await criado.app.inject({ method: 'POST', url: `${cfg.base}/api/auth/login`, payload: { usuario: USUARIO, senha: SENHA } });
    const sc = String(([] as string[]).concat(r.headers['set-cookie'] ?? [])[0]);
    return { cookie: sc.split(';')[0]!, csrf: r.json().csrf as string };
  };
  return {
    criado,
    cfg,
    falsos,
    login,
    fechar: async () => {
      await criado.app.close();
      await Promise.all(Object.values(falsos).map((f) => f.fechar()));
    },
  };
}
