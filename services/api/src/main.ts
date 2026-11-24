import Fastify from "fastify";
import { pool, bancoSaudavel } from "./db";
import { conectar, criarCanal, rpcCall, assinarConfig, mqSaudavel, FILAS } from "./mq";
import { logger, instrumentarFastify, client, encerrar, comSpan } from "./obs";
import { config, aplicarConfig, cacheObter, cacheGravar } from "./config";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { exigirAdmin, validarAmbiente, registrarTratamentoDeErros, origensCors } from "./seguranca";
import { escolherEquipe, normalizarPapel, type Candidato } from "./estrategias";

const PORTA = Number(process.env.PORT ?? 3000);

interface PapelRequerido {
  papel: string;
  pesoImportancia?: number;
}

interface CorpoRecomendacao {
  titulo?: string;
  orcamentoTotal?: number;
  papeisRequeridos?: PapelRequerido[];
  genero?: string;
}

interface ItemRecomendacao {
  papel: string;
  profissionalId: string | null;
  nome: string | null;
  custo: number;
}

// ---- métricas de negócio e de domínio ----
const duracaoAlgoritmo = new client.Histogram({
  name: "cinebridge_recomendacao_duracao_segundos",
  help: "Tempo de execução de cada algoritmo de recomendação",
  labelNames: ["estrategia"],
  buckets: [0.001, 0.005, 0.025, 0.1, 0.5, 1, 2, 3, 5, 10],
});
const recomendacoesGeradas = new client.Counter({
  name: "cinebridge_recomendacoes_geradas_total",
  help: "Recomendações de equipe geradas",
  labelNames: ["estrategia"],
});
const formacaoEquipe = new client.Histogram({
  name: "cinebridge_formacao_equipe_duracao_segundos",
  help: "Tempo total para formar uma equipe (requisição completa)",
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});
const receitaPotencial = new client.Counter({
  name: "cinebridge_receita_potencial_reais_total",
  help: "Receita potencial da plataforma (taxa sobre o custo planejado das equipes registradas)",
});
const TAXA_PLATAFORMA = Number(process.env.TAXA_PLATAFORMA ?? 0.1);

async function iniciarBanco(): Promise<void> {
  await pool.query(`
    create table if not exists recomendacoes (
      id uuid primary key default gen_random_uuid(),
      projeto_id text,
      titulo text not null,
      resultado jsonb not null,
      criado_em timestamptz not null default now()
    )
  `);
}

async function main(): Promise<void> {
  validarAmbiente(["ADMIN_TOKEN"]);
  process.on("SIGTERM", () => void encerrar().finally(() => process.exit(0)));

  await iniciarBanco();

  const conexao = await conectar();
  const canal = await criarCanal(conexao);
  await assinarConfig(canal, ["api.#", "todos.#"], aplicarConfig);

  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: true,
    bodyLimit: 100 * 1024, // 100 KB: payloads da API são pequenos
    trustProxy: process.env.TRUST_PROXY === "true", // IP real do cliente atrás do proxy reverso (Caddy)
  });
  instrumentarFastify(app);
  registrarTratamentoDeErros(app);

  // Cabeçalhos de segurança, CORS restrito (lista explícita; vazio = sem acesso cross-origin) e limite de taxa por IP.
  await app.register(helmet);
  await app.register(cors, { origin: origensCors().length ? origensCors() : false });
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
    timeWindow: "1 minute",
    allowList: (req) => req.url === "/health" || req.url === "/metrics", // sondas internas não consomem a cota
  });

  app.get("/health", async (_req, reply) => {
    const db = await bancoSaudavel();
    const mq = mqSaudavel();

    return reply.code(db && mq ? 200 : 503).send({
      status: db && mq ? "ok" : "degradado",
      db,
      mq,
    });
  });

  app.post<{ Body: CorpoRecomendacao }>(
    "/projetos/recomendacao",
    async (req, reply) => {
      const fimFormacao = formacaoEquipe.startTimer();
      const { titulo, orcamentoTotal, papeisRequeridos, genero } = req.body ?? {};

      // 1. Validar os dados recebidos.
      if (
        !titulo ||
        typeof titulo !== "string" ||
        typeof orcamentoTotal !== "number" ||
        !Number.isFinite(orcamentoTotal) ||
        !Array.isArray(papeisRequeridos)
      ) {
        return reply.code(400).send({
          erro: "titulo, orcamentoTotal e papeisRequeridos são obrigatórios",
        });
      }

      if (orcamentoTotal <= 0 || papeisRequeridos.length === 0) {
        return reply.code(422).send({
          erro: "orçamento deve ser positivo e ao menos um papel é necessário",
        });
      }

      if (
        papeisRequeridos.some(
          (p) => !p || typeof p.papel !== "string" || !p.papel.trim(),
        )
      ) {
        return reply.code(400).send({
          erro: "Todos os papéis precisam possuir um nome válido",
        });
      }

      // 2. Normalizar os papéis.
      const papeis = [
        ...new Set(papeisRequeridos.map((p) => normalizarPapel(p.papel))),
      ];

      // 3. Consultar profissionais pelo RabbitMQ (com cache dinâmico).
      let candidatos: Candidato[];
      const chaveCache = [...papeis].sort().join("|");

      try {
        const emCache = cacheObter<Candidato[]>(chaveCache);

        if (emCache) {
          candidatos = emCache;
        } else {
          const resp = await rpcCall<{
            candidatos: Candidato[];
          }>(canal, FILAS.consultaProfissionais, { papeis });

          if (!Array.isArray(resp?.candidatos)) {
            throw new Error("Resposta inválida do serviço de profissionais");
          }

          candidatos = resp.candidatos;
          cacheGravar(chaveCache, candidatos);
        }

        req.log.info(
          {
            papeis,
            quantidadeCandidatos: candidatos.length,
            cache: Boolean(emCache),
          },
          "Consulta de profissionais concluída",
        );
      } catch (e) {
        req.log.error(e);

        return reply.code(503).send({
          erro: "serviço de profissionais indisponível",
        });
      }

      // 4. Montar a equipe recomendada com a estratégia ativa (alterável pela governança).
      const estrategia = config.estrategia;
      const fimAlgoritmo = duracaoAlgoritmo.startTimer({ estrategia });
      const escolhidos = await comSpan(
        `recomendar ${estrategia}`,
        { atributos: { estrategia } },
        () => escolherEquipe(estrategia, papeis, candidatos, orcamentoTotal),
      );
      fimAlgoritmo();
      recomendacoesGeradas.inc({ estrategia });

      const itens: ItemRecomendacao[] = papeis.map((papel, i) => {
        const profissional = escolhidos[i];

        if (!profissional) {
          req.log.warn(
            { papel },
            "Nenhum profissional encontrado para este papel",
          );

          return {
            papel,
            profissionalId: null,
            nome: null,
            custo: 0,
          };
        }

        return {
          papel,
          profissionalId: profissional.id,
          nome: profissional.nome,
          custo: Number(profissional.custo),
        };
      });

      // 5. Calcular orçamento.
      const parcial = itens.some((item) => item.profissionalId === null);

      const custoPlanejado = itens.reduce((soma, item) => soma + item.custo, 0);

      const dentroDoOrcamento = custoPlanejado <= orcamentoTotal;

      // 6. Registrar projeto pelo RabbitMQ.
      let projetoId: string | null = null;

      try {
        const resp = await rpcCall<{
          projetoId: string;
        }>(canal, FILAS.registroProjetos, {
          titulo,
          orcamentoTotal,
          genero: typeof genero === "string" && genero.trim() ? genero.trim().toUpperCase() : "NAO_INFORMADO",
          equipe: itens,
        });

        projetoId = resp.projetoId ?? null;
        if (projetoId) receitaPotencial.inc(custoPlanejado * TAXA_PLATAFORMA);

        if (!projetoId) {
          throw new Error("Serviço de projetos não retornou projetoId");
        }
      } catch (e) {
        req.log.error(e);
      }

      // 7. Montar resultado.
      const resultado = {
        itens,
        parcial,
        custoPlanejado,
        dentroDoOrcamento,
      };

      // 8. Salvar recomendação.
      const { rows } = await pool.query(
        `
          insert into recomendacoes
            (projeto_id, titulo, resultado)
          values ($1, $2, $3)
          returning id
        `,
        [projetoId, titulo, JSON.stringify(resultado)],
      );

      fimFormacao();
      // 9. Retornar resultado.
      return reply.code(201).send({
        recomendacaoId: rows[0].id,
        projetoId,
        estrategia,
        ...resultado,
        ...(projetoId
          ? {}
          : {
              aviso: "projeto não registrado: serviço de projetos indisponível",
            }),
      });
    },
  );

  // Configuração dinâmica em vigor (útil para validar a governança).
  app.get("/config", { preHandler: exigirAdmin }, async () => config);

  // Apenas demonstração: simula um recomendador principal lento para exercitar a governança.
  if (process.env.HABILITAR_SIMULACAO === "true") {
    app.post<{ Body: { latenciaPrincipalMs?: number } }>("/admin/simulacao", { preHandler: exigirAdmin }, async (req, reply) => {
      const ms = req.body?.latenciaPrincipalMs;
      if (typeof ms !== "number" || ms < 0 || ms > 30000) {
        return reply.code(400).send({ erro: "latenciaPrincipalMs deve estar entre 0 e 30000" });
      }
      config.simulacaoLatenciaPrincipalMs = ms;
      logger.warn({ latenciaPrincipalMs: ms }, "simulação de latência do recomendador principal alterada");
      return { latenciaPrincipalMs: ms };
    });
  }

  // Consultar recomendações registradas.
  app.get("/recomendacoes", async () => {
    const { rows } = await pool.query(`
      select
        id,
        projeto_id as "projetoId",
        titulo,
        resultado,
        criado_em as "criadoEm"
      from recomendacoes
      order by criado_em desc
      limit 20
    `);

    return rows;
  });

  await app.listen({
    port: PORTA,
    host: "0.0.0.0",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
