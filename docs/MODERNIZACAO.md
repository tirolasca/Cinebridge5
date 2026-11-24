# Registro de modernização (Fase 1–3 parcial)

Data da análise: 2026-11-18. Ambiente de análise sem Docker: itens de container **não foram executados**.

## Versões (npm) — antes → depois
| Pacote | Antes | Depois | Observação |
| --- | --- | --- | --- |
| prom-client | 15.1.3 (deprecated) | **@prometheus-io/client 0.16.1** | mesma base (prometheus/client_js), API idêntica; testado |
| amqplib | 2.3.1 | **2.4.0** | |
| fastify 5.12.8, pg 8.23.1, pino 10.4.0, typescript 7.0.2, @types/node 26.6.6, @types/pg 8.23.1 | já na última | — | |
| @opentelemetry/api | 1.9.1 | 1.9.1 (latest 1.10.0) | SDK 2.12.x exige api <1.10 |
| @opentelemetry/exporter-trace-otlp-http | 0.300.0 | 0.300.0 (latest 0.301.2) | 0.301 exige api ^1.10 |
| @opentelemetry/resources | 2.12.1 | 2.12.1 (latest 3.1.1) | linha 3.x incompatível com SDK 2.x |
| `npm audit` | — | 0 vulnerabilidades (5 serviços) | |

## Node.js
Node 26 entrou em Active LTS em 28/10/2026 (suporte até 04/2029); Node 24 passou a Maintenance em 20/10/2026. `node:26-alpine` dos Dockerfiles está correto; falta fixar a versão menor (requer consulta ao Docker Hub, indisponível aqui).

## Hospedagem gratuita — condições levantadas (nov/2026)
| Provedor | Situação | Serve para a stack completa? |
| --- | --- | --- |
| Oracle Cloud Always Free | Ampere A1 reduzido para 2 OCPU/12 GB em 15/06/2026 (fontes divergem sobre contas antigas); exige cartão; risco de falta de capacidade e recuperação de instâncias ociosas | **Única opção viável** para Compose completo (ARM64) |
| Render | Free: 512 MB, dorme após 15 min, sem disco persistente, Postgres expira em 30 dias, sem RabbitMQ | Não |
| Railway | Plano free: US$1/mês de crédito, 0,5 GB por serviço | Não |
| Fly.io | Sem plano gratuito para novas contas | Não |
| Google Cloud | e2-micro (1 GB) | Não comporta |

## Fase 4 (infra provedor-agnóstica) — feito
| Item | Situação |
| --- | --- |
| Tags de imagem fixas (sem `latest`) | prometheus v3.16.0, grafana 13.3.1, loki 3.7.10, alloy v1.22.0, cadvisor v0.61.0 (ghcr), rabbitmq 4.4.1, caddy 2.11.9, jaeger **v2** 2.23.0 (all-in-one v1 descontinuado), postgres 18-alpine (linha major). **Tags não verificadas no Docker Hub** (sem acesso): confirme no primeiro `pull` |
| Dockerfiles | multi-stage, cache de npm, runtime só com deps de produção, `USER node`; `init: true` (tini) nos containers |
| API | helmet, CORS, rate limit, bodyLimit, erro 5xx opaco, rotas admin com token, validação de ambiente de produção |
| PostgreSQL | pool limitado + tratamento de erro de conexão ociosa; PG18 já montado em `/var/lib/postgresql` |
| Governança | `DOCKER_HABILITADO=false` desliga escalonamento/volumes (produção sem socket); `/estado` protegido |
| Compose | overlay de produção validado com `docker compose config`; só Caddy publica portas |
| Testes | 13 testes da API (estratégias, cache/config, autorização, erros, métricas) |
| CI/CD | `ci.yml` e `deploy.yml` (SSH) criados — **ainda não executados no GitHub**; versões das actions (checkout@v7, setup-node@v6) a confirmar |
| Backup/restore | scripts sh e PowerShell — **não executados** (sem Docker aqui) |

## Control Center (seção 14) — feito
Frontend `frontend/` (React 19, Vite 8, Tailwind 4, TanStack Query, Recharts; **TypeScript 6.0.3** por incompatibilidade do typescript-eslint com TS 7) + BFF `services/admin` (sessão no servidor, scrypt, CSRF, rate limit, SSE). 33 testes de frontend + 20 de BFF; integração validada com Caddy real. Ver `docs/CONTROL_CENTER.md`. **Não verificado:** visual em navegador real, build Docker.

## Pendências
Build real das imagens e subida dos containers, Jaeger v2 com Badger (config não testada), Grafana 13 com os dashboards, hospedagem (sem opção gratuita sem cartão), frontend (Control Center).
Imagens com tags fixas, Dockerfiles (usuário não-root, init), Compose de produção/observabilidade, segurança (CORS, headers, rate limit, auth das rotas admin/métricas), backups, CI/CD, testes automatizados, frontend, deploy.
