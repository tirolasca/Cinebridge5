# Cinebridge — Arquitetura (observabilidade, governança e evolução autônoma)

Evolução da arquitetura da ATVIV (4 microsserviços + RabbitMQ + 4 PostgreSQL) com:

1. **Instrumentação** dos serviços: métricas Prometheus (`/metrics`), logs JSON estruturados e traces distribuídos (OpenTelemetry) propagados por HTTP **e** pelas mensagens do RabbitMQ.
2. **Stack de observabilidade** no `docker-compose.yml`: Prometheus, Grafana, Loki (+ Alloy para coletar os logs do Docker), Jaeger, cAdvisor — todos na rede `cinebridge-net`, com dados em volumes.
3. **Três dashboards** pré-provisionados no Grafana.
4. **`cinebridge-governanca`**: serviço que lê o Prometheus, aplica regras e muda o comportamento do sistema em tempo de execução.

Compatível com Windows 10+ (Docker Desktop) e Ubuntu 24.04+ / derivadas (Docker Engine + Compose v2).

## Como subir

```
docker compose up --build -d
docker compose ps              # aguarde "healthy"
sh scripts/smoke.sh            # teste ponta a ponta + checagem do stack (Windows: Git Bash/WSL)
docker compose down            # mantém os dados  |  docker compose down -v  descarta os volumes
```

Opcional: `cp .env.example .env` para trocar senhas e limiares.

| Interface | URL | Acesso |
| --- | --- | --- |
| Grafana (dashboards) | http://localhost:3005 | `admin` / `cinebridge` |
| Prometheus | http://localhost:9090 | — |
| Jaeger | http://localhost:16686 | — |
| RabbitMQ | http://localhost:15672 | `guest` / `guest` |
| cAdvisor | http://localhost:8081 | — |
| API / profissionais / projetos / notificações / governança | :3000 / :3001 / :3002 / :3003 / :3004 | — |

## O que cada serviço expõe

Todos: `GET /metrics` (Prometheus), `GET /health`, logs JSON em stdout e header `x-correlation-id` (= trace id) nas respostas.

| Serviço | Métricas de domínio |
| --- | --- |
| `cinebridge-profissionais` | `cinebridge_profissionais_total`, `cinebridge_profissionais_por_especialidade{especialidade}` |
| `cinebridge-projetos` | `cinebridge_projetos_ativos{genero}`, `cinebridge_projetos_por_status`, `cinebridge_convites_total{resultado}` |
| `cinebridge-api` (recomendação) | `cinebridge_recomendacao_duracao_segundos{estrategia}` (tempo de cada algoritmo), `cinebridge_recomendacoes_geradas_total`, `cinebridge_formacao_equipe_duracao_segundos`, `cinebridge_receita_potencial_reais_total`, `cinebridge_cache_consultas_total{resultado}` |
| `cinebridge-notificacoes` | `cinebridge_notificacoes_total{canal,resultado}` (taxa de entrega por canal) |
| Todos | `cinebridge_http_requests_total`, `cinebridge_http_request_duration_seconds`, `cinebridge_http_request_size_bytes`, `cinebridge_http_response_size_bytes`, `cinebridge_mq_*`, `cinebridge_nodejs_heap_*`, `cinebridge_process_cpu_seconds_total` |

Log de exemplo (campos: `timestamp`, `nivel`, `servico`, `correlationId`, `mensagem` + metadados):

```json
{"nivel":"info","timestamp":"2026-11-17T19:47:52.011Z","servico":"cinebridge-api","correlationId":"4bf92f35...","metodo":"POST","rota":"/projetos/recomendacao","status":201,"duracaoMs":48,"mensagem":"requisição concluída"}
```

**Trace distribuído:** o `traceparent` (W3C) é injetado nos headers das mensagens AMQP (`publicar`/`rpcCall`) e extraído em `consumir`. Uma recomendação gera um único trace atravessando api → profissionais → projetos → notificações. No Grafana (Loki), clicar no `correlationId` de um log abre o trace no Jaeger.

Novidades de API para sustentar as métricas de negócio:
- `POST /projetos/recomendacao` aceita `genero` (opcional) e devolve a `estrategia` usada.
- `POST /projetos/:id/convites/:profissionalId` com `{"aceito": true|false}` (projetos) — alimenta a taxa de aceitação de convites.
- `GET /config` (api) mostra a configuração dinâmica; `POST /admin/simulacao` (api, só com `HABILITAR_SIMULACAO=true`) simula um recomendador lento.

## Dashboards (Grafana → pasta *Cinebridge*)

| Painel | Conteúdo |
| --- | --- |
| **Saúde Operacional** | latência p50/p90/p99 por serviço, taxa de erros, CPU e memória por container (cAdvisor), filas do RabbitMQ, logs de aviso/erro (Loki). Limiares coloridos (amarelo/vermelho). Alertas equivalentes em `observability/prometheus/alerts.yml`. |
| **Inteligência de Negócio** | recomendações/hora, aceitação de convites, tempo médio de formação de equipe, projetos ativos por gênero, receita potencial (taxa de 10% sobre o custo planejado, configurável), profissionais por especialidade, entrega de notificações por canal. |
| **Evolução Dinâmica** | estratégia ativa, tempo do algoritmo por estratégia, taxa de acerto do cache × TTL, latência da API, CPU, réplicas, volumes de dados, amostragem de traces e a trilha de auditoria. **Cada ação da governança aparece como anotação laranja** sobre as séries, permitindo ver o efeito antes/depois. |

## Governança (`services/governanca`)

Ciclo a cada 15 s: consulta o Prometheus → avalia regras → publica configuração no RabbitMQ (exchange `cinebridge.config`, chaves `<servico>.<assunto>` / `todos.<assunto>`; cada instância recebe sua cópia numa fila exclusiva) → registra auditoria (log JSON com `auditoria:true`, arquivo `/data/auditoria.jsonl`, contador Prometheus e anotação no Grafana).

| # | Regra (padrões do enunciado) | Ação |
| --- | --- | --- |
| 1 | tempo médio do recomendador `PRINCIPAL` > 2 s por mais de 5 min | api alterna para `ORCAMENTO` (regras de orçamento, mais rápida). Após 15 min tenta voltar à principal (se continuar lenta, troca de novo). |
| 2 | taxa de acerto do cache < 30% / > 80% (janela de 5 min, mín. 20 consultas, 2 min entre ajustes) | < 30%: dobra TTL e tamanho (até 600 s / 1000). > 80%: divide o TTL por 2 (mín. 5 s). |
| 3 | CPU média do serviço > 70% por mais de 10 min / < 30% | cria / remove réplica via API do Docker (máx. 3 instâncias). Aplica-se a `profissionais`, `projetos` e `notificacoes` (consumidores de fila, que dividem o trabalho naturalmente). Réplicas são raspadas pelo Prometheus automaticamente. |
| 4 | volume do Loki > 512 MB / do Jaeger > 256 MB (checado a cada 5 min) | apaga logs com mais de 24 h via API de exclusão do Loki; reduz a amostragem de traces (÷2, mín. 10%) e restaura quando há folga. Complementos estáticos: rotação do Docker (`10m × 3`), retenção do Loki 7 d, Jaeger 72 h, Prometheus 7 d / 1 GB. |

A governança reenvia o estado vigente a cada 60 s, de modo que um serviço que reinicie volta à configuração decidida.

Todos os limiares são variáveis de ambiente (ver `.env.example`). `GET http://localhost:3004/estado` mostra estado e limiares.

### Demonstração rápida (janelas curtas)

```
# .env
GOV_LATENCIA_JANELA_S=60
GOV_CACHE_COOLDOWN_S=45
GOV_REVERSAO_S=180
```
```
docker compose up --build -d
sh scripts/demo.sh carga 300      # alimenta dashboards e o cache
sh scripts/demo.sh convites       # alimenta a taxa de aceitação
sh scripts/demo.sh lentidao 2500  # recomendador principal passa a levar 2,5 s
sh scripts/demo.sh carga 150 1    # mantenha tráfego por > 1 min
sh scripts/demo.sh estado         # estrategia deve estar em ORCAMENTO
sh scripts/demo.sh auditoria      # ações registradas
```
Abra *Evolução Dinâmica*: a troca de estratégia aparece como anotação e o tempo do algoritmo cai. `sh scripts/demo.sh lentidao 0` remove a simulação.

## Estrutura

```
services/{api,profissionais,projetos,notificacoes,governanca}/src
   obs.ts   métricas + logs + tracing + instrumentação Fastify (idêntico nos 5 serviços)
   mq.ts    RabbitMQ com propagação de trace e canal de configuração (idêntico nos 5 serviços)
observability/{prometheus,loki,alloy,grafana}
scripts/{smoke.sh,demo.sh}
```

## Control Center (painel web)
Interface administrativa em **http://localhost:3010/painel/** (React + TypeScript + Vite + Tailwind; BFF Fastify com sessão segura). Visão geral em tempo real, serviços, profissionais, projetos/convites, recomendações, mensageria, observabilidade e governança. Detalhes, segurança e testes: **[docs/CONTROL_CENTER.md](docs/CONTROL_CENTER.md)**. A senha inicial local é impressa uma vez em `docker compose logs cinebridge-admin`.

## Ambientes (Compose)

| Arquivo | Uso |
| --- | --- |
| `docker-compose.yml` | ambiente **local completo** (todas as ferramentas de observabilidade, governança com escalonamento) |
| `docker-compose.prod.yml` | overlay de **produção**: só o Caddy publica portas (HTTPS), segredos obrigatórios, limites de memória, governança sem Docker, observabilidade pesada em `--profile observabilidade-completa` |

Guia completo, domínio gratuito, backup e CI/CD: **[DEPLOY.md](DEPLOY.md)**. Registro de versões e decisões: `docs/MODERNIZACAO.md`.

## Segurança (API pública)
Helmet, CORS por lista, rate limit por IP, corpo limitado, erros 5xx sem vazar detalhes, `GET /config`, `POST /admin/simulacao` e `GET /estado` exigem `Authorization: Bearer $ADMIN_TOKEN` (em produção o token é obrigatório e a simulação é proibida). Containers rodam como usuário `node`. Testes: `cd services/api && npm test`.

## Segurança e limitações (ambiente local)

- **Socket do Docker**: Prometheus (descoberta de alvos), Alloy (coleta de logs) e governança (escalonamento) montam `/var/run/docker.sock`; Prometheus roda como root por isso. Quem controla esses containers controla o host. Em produção, use um proxy de socket restrito ou um orquestrador (Kubernetes/Swarm).
- Senha do Grafana padrão e `POST /admin/simulacao` habilitado: apenas para demonstração. Defina `GRAFANA_PASSWORD` e `HABILITAR_SIMULACAO=false`.
- Configuração dinâmica fica em memória; a governança a reenvia a cada 60 s. As réplicas criadas pela governança não pertencem ao Compose: ela as remove ao receber SIGTERM (`docker compose down`); se o encerramento for forçado, use `docker rm -f <servico>-r2`.
- Replicar `cinebridge-api` não distribui tráfego HTTP (não há balanceador); por isso só os consumidores de fila escalam por padrão.
- A taxa de aceitação de convites e a receita potencial são contadores em memória/derivados de eventos; não há persistência de convites.
- A biblioteca de métricas foi migrada de `prom-client` (deprecated) para `@prometheus-io/client` 0.16.1 (mesmo projeto, API idêntica; nomes de métricas inalterados). Versões do OpenTelemetry estão fixadas (`api` 1.9.1, `sdk-trace-node` 2.12.1, exporter 0.300.0, `resources` 2.12.1): as versões mais novas de `api`/exporter (1.10/0.301) exigem peer incompatível com o SDK 2.x e `resources` 3.x pertence a outra linha.
- Imagens da stack usam a tag `latest` (como no enunciado); fixe versões após validar.
