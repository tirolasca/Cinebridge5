import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { Config } from './config';
import { logger, instrumentarFastify } from './obs';
import { registrarTratamentoDeErros } from './seguranca';
import { hashSenha, verificarSenha, senhaAleatoria } from './senha';
import { Sessoes, type Sessao } from './sessoes';
import { chamar, type Resposta } from './http';
import { criarFontes, type Fontes } from './fontes';
import { SERVICOS, auditoriaGovernanca, criarCacheOverview, statusServicos, tentar } from './agregador';

const COOKIE = 'cb_sid';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIVEIS = ['debug', 'info', 'warn', 'error', 'fatal'];
const SERVICO_ID = new RegExp(`^(${SERVICOS.map((s) => s.id).join('|')})$`);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

declare module 'fastify' {
  interface FastifyRequest {
    sessao?: Sessao;
  }
  interface FastifyContextConfig {
    publico?: boolean;
  }
}

export interface AppCriado {
  app: FastifyInstance<any, any, any, any, any>;
  sessoes: Sessoes;
  /** Preenchida só quando a senha foi gerada automaticamente (ambiente local sem ADMIN_PASSWORD_HASH). */
  senhaInicial?: string;
}

export async function construirApp(cfg: Config, fontesExternas?: Fontes): Promise<AppCriado> {
  let senhaInicial: string | undefined;
  let hash = cfg.senhaHash;
  if (!hash) {
    senhaInicial = senhaAleatoria();
    hash = await hashSenha(senhaInicial);
  }
  const hashDummy = await hashSenha(senhaAleatoria()); // igualiza o tempo de resposta quando o usuário não existe

  const sessoes = new Sessoes(cfg.sessaoMin * 60_000, cfg.ociosoMin * 60_000);
  const fontes = fontesExternas ?? criarFontes(cfg);
  const obterOverview = criarCacheOverview(cfg, fontes);
  const limpeza = setInterval(() => sessoes.limpar(), 60_000);
  limpeza.unref();
  let streamsAbertos = 0;

  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: true,
    bodyLimit: 64 * 1024,
    trustProxy: cfg.trustProxy,
  });
  instrumentarFastify(app);
  registrarTratamentoDeErros(app);
  app.addHook('onClose', async () => clearInterval(limpeza));

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // estilos inline gerados pelos gráficos (Recharts)
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/health' || req.url === '/metrics',
  });

  app.get('/health', async () => ({ status: 'ok', sessoes: sessoes.total }));

  // ------------------------------------------------------------------ API autenticada
  await app.register(
    async (api) => {
      const falhaUpstream = (reply: FastifyReply, e?: unknown) => {
        if (e) logger.warn({ erro: (e as Error).message }, 'falha ao consultar serviço interno');
        return reply.code(502).send({ erro: 'serviço interno indisponível' });
      };
      /** Repassa a resposta do serviço interno: 4xx (validação) como veio; 5xx vira 502 opaco. */
      const repassar = (reply: FastifyReply, r: Resposta) =>
        r.status >= 500 ? falhaUpstream(reply) : reply.code(r.status).send(r.corpo ?? {});
      const upstream = async (reply: FastifyReply, fn: () => Promise<Resposta>) => {
        try {
          return repassar(reply, await fn());
        } catch (e) {
          return falhaUpstream(reply, e);
        }
      };
      const adminHeaders = (): Record<string, string> => (cfg.adminToken ? { authorization: `Bearer ${cfg.adminToken}` } : {});

      api.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
        const publico = req.routeOptions.config?.publico === true;
        const mutacao = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        if (mutacao) {
          // Defesa em profundidade contra CSRF: SameSite=Strict + checagem de origem + token por sessão.
          const origem = req.headers.origin;
          if (req.headers['sec-fetch-site'] === 'cross-site') return reply.code(403).send({ erro: 'origem não permitida' });
          if (origem) {
            let host = '';
            try {
              host = new URL(origem).host;
            } catch {
              /* inválida */
            }
            if (host !== req.headers.host) return reply.code(403).send({ erro: 'origem não permitida' });
          }
        }
        if (publico) return;
        const sessao = sessoes.obter(req.cookies[COOKIE]);
        if (!sessao) return reply.code(401).send({ erro: 'não autenticado' });
        if (mutacao && req.headers['x-csrf-token'] !== sessao.csrf) return reply.code(403).send({ erro: 'token CSRF inválido' });
        req.sessao = sessao;
      });

      // ------------------------------ autenticação
      api.post<{ Body: { usuario?: unknown; senha?: unknown } }>(
        '/auth/login',
        { config: { publico: true, rateLimit: { max: cfg.limiteLogin, timeWindow: '1 minute' } } },
        async (req, reply) => {
          const { usuario, senha } = req.body ?? {};
          if (typeof usuario !== 'string' || typeof senha !== 'string' || !usuario || !senha || usuario.length > 128 || senha.length > 256) {
            return reply.code(400).send({ erro: 'usuário e senha são obrigatórios' });
          }
          const usuarioOk = usuario === cfg.usuario;
          const senhaOk = await verificarSenha(senha, usuarioOk ? (hash as string) : hashDummy);
          if (!usuarioOk || !senhaOk) {
            logger.warn({ ip: req.ip }, '[auth] tentativa de login inválida');
            await dormir(400);
            return reply.code(401).send({ erro: 'usuário ou senha inválidos' });
          }
          const sessao = sessoes.criar(usuario); // novo identificador a cada login (evita fixação de sessão)
          reply.setCookie(COOKIE, sessao.id, {
            httpOnly: true,
            secure: cfg.cookieSeguro,
            sameSite: 'strict',
            path: cfg.base || '/',
            maxAge: cfg.sessaoMin * 60,
          });
          logger.info({ usuario }, '[auth] login');
          return { usuario, csrf: sessao.csrf };
        },
      );

      api.post('/auth/logout', async (req, reply) => {
        if (req.sessao) sessoes.destruir(req.sessao.id);
        reply.clearCookie(COOKIE, { path: cfg.base || '/' });
        return reply.code(204).send();
      });

      api.get('/auth/me', async (req) => ({ usuario: req.sessao!.usuario, csrf: req.sessao!.csrf }));

      // ------------------------------ visão geral, serviços e tempo real
      api.get('/overview', async (_req, reply) => {
        try {
          return await obterOverview();
        } catch (e) {
          return falhaUpstream(reply, e);
        }
      });

      api.get('/servicos', async () => ({ geradoEm: new Date().toISOString(), servicos: await statusServicos(cfg, fontes) }));

      api.get('/stream', async (req, reply) => {
        if (streamsAbertos >= 20) return reply.code(429).send({ erro: 'limite de conexões em tempo real atingido' });
        const sid = req.sessao!.id;
        reply.hijack();
        const raw = reply.raw;
        raw.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
          'x-content-type-options': 'nosniff',
        });
        streamsAbertos++;
        let fechado = false;
        const encerrar = () => {
          if (fechado) return;
          fechado = true;
          clearInterval(tick);
          clearInterval(batida);
          streamsAbertos--;
          raw.end();
        };
        const enviar = async () => {
          if (!sessoes.valida(sid)) {
            raw.write('event: sessao-expirada\ndata: {}\n\n');
            return encerrar();
          }
          try {
            raw.write(`event: overview\ndata: ${JSON.stringify(await obterOverview())}\n\n`);
          } catch {
            raw.write('event: erro\ndata: {}\n\n');
          }
        };
        const tick = setInterval(() => void enviar(), Number(process.env.INTERVALO_STREAM_S ?? 10) * 1000);
        const batida = setInterval(() => raw.write(': batida\n\n'), 15_000);
        req.raw.on('close', encerrar);
        raw.write('retry: 5000\n\n');
        await enviar();
      });

      // ------------------------------ profissionais, projetos, recomendação, notificações (contratos preservados)
      api.get<{ Querystring: { papel?: string } }>('/profissionais', async (req, reply) => {
        const papel = req.query.papel;
        if (papel !== undefined && (typeof papel !== 'string' || papel.length > 40)) return reply.code(400).send({ erro: 'papel inválido' });
        return upstream(reply, () => chamar(`${cfg.urls.profissionais}/profissionais${papel ? `?papel=${encodeURIComponent(papel)}` : ''}`));
      });

      api.post<{ Body: Record<string, unknown> }>('/profissionais', async (req, reply) => {
        const { nome, papel, custo, notaMedia, competencias } = req.body ?? {};
        return upstream(reply, () => chamar(`${cfg.urls.profissionais}/profissionais`, { metodo: 'POST', corpo: { nome, papel, custo, notaMedia, competencias } }));
      });

      api.get('/projetos', async (_req, reply) => upstream(reply, () => chamar(`${cfg.urls.projetos}/projetos`)));

      api.get<{ Params: { id: string } }>('/projetos/:id', async (req, reply) => {
        if (!UUID.test(req.params.id)) return reply.code(400).send({ erro: 'id inválido' });
        return upstream(reply, () => chamar(`${cfg.urls.projetos}/projetos/${req.params.id}`));
      });

      api.post<{ Body: Record<string, unknown> }>('/projetos', async (req, reply) => {
        const { titulo, orcamentoTotal, equipe, genero } = req.body ?? {};
        return upstream(reply, () => chamar(`${cfg.urls.projetos}/projetos`, { metodo: 'POST', corpo: { titulo, orcamentoTotal, equipe, genero } }));
      });

      api.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/projetos/:id', async (req, reply) => {
        if (!UUID.test(req.params.id)) return reply.code(400).send({ erro: 'id inválido' });
        const { titulo, status } = req.body ?? {};
        return upstream(reply, () => chamar(`${cfg.urls.projetos}/projetos/${req.params.id}`, { metodo: 'PATCH', corpo: { titulo, status } }));
      });

      api.post<{ Params: { id: string; profissionalId: string }; Body: Record<string, unknown> }>('/projetos/:id/convites/:profissionalId', async (req, reply) => {
        if (!UUID.test(req.params.id) || !UUID.test(req.params.profissionalId)) return reply.code(400).send({ erro: 'id inválido' });
        return upstream(reply, () =>
          chamar(`${cfg.urls.projetos}/projetos/${req.params.id}/convites/${req.params.profissionalId}`, { metodo: 'POST', corpo: { aceito: req.body?.aceito } }),
        );
      });

      api.post<{ Body: Record<string, unknown> }>('/recomendacoes', async (req, reply) => {
        const { titulo, orcamentoTotal, papeisRequeridos, genero } = req.body ?? {};
        return upstream(reply, () =>
          chamar(`${cfg.urls.api}/projetos/recomendacao`, { metodo: 'POST', corpo: { titulo, orcamentoTotal, papeisRequeridos, genero }, timeoutMs: 15000 }),
        );
      });

      api.get('/recomendacoes', async (_req, reply) => upstream(reply, () => chamar(`${cfg.urls.api}/recomendacoes`)));
      api.get('/notificacoes', async (_req, reply) => upstream(reply, () => chamar(`${cfg.urls.notificacoes}/notificacoes`)));

      // ------------------------------ mensageria
      api.get('/mensageria', async (_req, reply) => {
        const [filas, erros] = await Promise.all([
          tentar(() => fontes.rabbit.filas()),
          tentar(() => fontes.prom.vetor('sum by (fila) (increase(cinebridge_mq_mensagens_total{resultado="erro"}[1h]))')),
        ]);
        if (!filas) return reply.code(502).send({ erro: 'RabbitMQ indisponível' });
        const duraveis = filas.filter((q) => !q.temporaria);
        return {
          geradoEm: new Date().toISOString(),
          totais: {
            filas: duraveis.length,
            prontas: duraveis.reduce((a, q) => a + q.prontas, 0),
            naoConfirmadas: duraveis.reduce((a, q) => a + q.naoConfirmadas, 0),
            consumidores: duraveis.reduce((a, q) => a + q.consumidores, 0),
            taxaPublicacao: Math.round(filas.reduce((a, q) => a + q.taxaPublicacao, 0) * 100) / 100,
            taxaConsumo: Math.round(filas.reduce((a, q) => a + q.taxaConsumo, 0) * 100) / 100,
            errosUltimaHora: erros ? Math.round(erros.reduce((a, x) => a + x.valor, 0)) : null,
          },
          filas,
          deadLetter: filas.filter((q) => /dead|dlq|dlx/i.test(q.nome)),
          deadLetterConfigurado: filas.some((q) => /dead|dlq|dlx/i.test(q.nome)),
        };
      });

      // ------------------------------ observabilidade (consultas nomeadas: nenhum PromQL/LogQL arbitrário do cliente)
      api.get('/observabilidade/metricas', async () => {
        const q = (expr: string) => tentar(() => fontes.prom.vetor(expr));
        const [p50, p95, erro, cpu, heap, rps] = await Promise.all([
          q('histogram_quantile(0.5, sum by (le, servico) (rate(cinebridge_http_request_duration_seconds_bucket{rota!~"/health|/metrics"}[5m])))'),
          q('histogram_quantile(0.95, sum by (le, servico) (rate(cinebridge_http_request_duration_seconds_bucket{rota!~"/health|/metrics"}[5m])))'),
          q('sum by (servico) (rate(cinebridge_http_requests_total{status=~"5.."}[5m])) / sum by (servico) (rate(cinebridge_http_requests_total[5m]))'),
          q('avg by (servico) (rate(cinebridge_process_cpu_seconds_total[1m])) * 100'),
          q('max by (servico) (cinebridge_nodejs_heap_size_used_bytes)'),
          q('sum by (servico) (rate(cinebridge_http_requests_total{rota!~"/health|/metrics"}[5m]))'),
        ]);
        const por = (v: typeof p50, id: string, k = 1) => {
          const x = v?.find((i) => i.metrica.servico === id)?.valor;
          return x === undefined ? null : Math.round(x * k * 100) / 100;
        };
        return {
          geradoEm: new Date().toISOString(),
          prometheusDisponivel: [p50, p95, erro, cpu, heap, rps].some((x) => x !== null),
          servicos: SERVICOS.map((s) => ({
            id: s.id,
            nome: s.nome,
            latenciaP50Ms: por(p50, s.id, 1000),
            latenciaP95Ms: por(p95, s.id, 1000),
            taxaErros: por(erro, s.id),
            cpuPct: por(cpu, s.id),
            heapBytes: por(heap, s.id),
            reqPorSegundo: por(rps, s.id),
          })),
        };
      });

      api.get<{ Querystring: { servico?: string; nivel?: string; busca?: string; limite?: string; minutos?: string } }>('/observabilidade/logs', async (req, reply) => {
        const { servico, nivel, busca } = req.query;
        if (servico && !SERVICO_ID.test(servico)) return reply.code(400).send({ erro: 'serviço inválido' });
        if (nivel && !NIVEIS.includes(nivel)) return reply.code(400).send({ erro: 'nível inválido' });
        if (busca && busca.length > 80) return reply.code(400).send({ erro: 'busca muito longa' });
        const limite = Math.min(Math.max(Number(req.query.limite ?? 100) || 100, 1), 300);
        const minutos = Math.min(Math.max(Number(req.query.minutos ?? 60) || 60, 1), 1440);
        try {
          return { linhas: await fontes.loki.logs({ servico, nivel, busca, limite, minutos }) };
        } catch (e) {
          return reply.code(502).send({ erro: 'Loki indisponível (perfil de observabilidade completa desligado?)', detalhe: (e as Error).message });
        }
      });

      api.get<{ Querystring: { servico?: string; limite?: string } }>('/observabilidade/traces', async (req, reply) => {
        const servico = req.query.servico ?? 'cinebridge-api';
        if (!SERVICO_ID.test(servico)) return reply.code(400).send({ erro: 'serviço inválido' });
        const limite = Math.min(Math.max(Number(req.query.limite ?? 20) || 20, 1), 50);
        try {
          return { traces: await fontes.jaeger.traces(servico, limite), jaegerUrl: cfg.urls.jaegerPublico };
        } catch (e) {
          return reply.code(502).send({ erro: 'Jaeger indisponível (perfil de observabilidade completa desligado?)', detalhe: (e as Error).message });
        }
      });

      api.get('/observabilidade/links', async () => ({
        grafana: cfg.urls.grafanaPublico,
        jaeger: cfg.urls.jaegerPublico,
        dashboards: [
          { nome: 'Saúde Operacional', url: `${cfg.urls.grafanaPublico}/d/cinebridge-saude` },
          { nome: 'Inteligência de Negócio', url: `${cfg.urls.grafanaPublico}/d/cinebridge-negocio` },
          { nome: 'Evolução Dinâmica', url: `${cfg.urls.grafanaPublico}/d/cinebridge-evolucao` },
        ],
      }));

      // ------------------------------ governança (leitura + intervenção manual auditada)
      api.get('/governanca', async (_req, reply) => {
        const [estado, auditoria, configApi] = await Promise.all([
          tentar(async () => {
            const r = await chamar<Record<string, unknown>>(`${cfg.urls.governanca}/estado`, { headers: adminHeaders(), timeoutMs: 4000 });
            if (r.status !== 200) throw new Error(String(r.status));
            return r.corpo;
          }),
          auditoriaGovernanca(cfg, 100),
          tentar(async () => {
            const r = await chamar<Record<string, unknown>>(`${cfg.urls.api}/config`, { headers: adminHeaders(), timeoutMs: 4000 });
            return r.status === 200 ? r.corpo : null;
          }),
        ]);
        if (!estado) return reply.code(502).send({ erro: 'governança indisponível' });
        return { geradoEm: new Date().toISOString(), estado, configApi, auditoria: auditoria ?? [] };
      });

      api.post<{ Body: { valor?: unknown } }>('/governanca/estrategia', async (req, reply) => {
        const valor = req.body?.valor;
        if (valor !== 'PRINCIPAL' && valor !== 'ORCAMENTO') return reply.code(400).send({ erro: 'valor deve ser PRINCIPAL ou ORCAMENTO' });
        logger.warn({ usuario: req.sessao!.usuario, valor }, '[admin] troca manual de estratégia');
        return upstream(reply, () =>
          chamar(`${cfg.urls.governanca}/acoes/estrategia`, { metodo: 'POST', headers: adminHeaders(), corpo: { valor, operador: req.sessao!.usuario } }),
        );
      });

      api.setNotFoundHandler((_req, reply) => reply.code(404).send({ erro: 'rota não encontrada' }));
    },
    { prefix: `${cfg.base}/api` },
  );

  // ------------------------------------------------------------------ SPA estática
  const raiz = resolve(cfg.staticDir);
  if (existsSync(resolve(raiz, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: raiz,
      prefix: `${cfg.base}/`,
      index: ['index.html'],
      setHeaders: (res, caminho) => {
        res.header('cache-control', caminho.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.get(cfg.base, async (_req, reply) => reply.redirect(`${cfg.base}/`));
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && req.url.startsWith(`${cfg.base}/`) && !req.url.startsWith(`${cfg.base}/api/`) && !/\.[a-z0-9]+(\?|$)/i.test(req.url)) {
        return reply.header('cache-control', 'no-cache').sendFile('index.html');
      }
      return reply.code(404).send({ erro: 'não encontrado' });
    });
  }

  return { app, sessoes, senhaInicial };
}
