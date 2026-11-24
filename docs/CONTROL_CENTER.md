# Cinebridge Control Center

Painel administrativo web (React + TypeScript + Vite + Tailwind CSS) servido por um BFF Fastify (`services/admin`). Rotas em **`/painel/`**.

- Local: `docker compose up --build -d` → http://localhost:3010/painel/ (usuário `admin`; senha aleatória impressa **uma vez** em `docker compose logs cinebridge-admin`, a menos que você defina `ADMIN_PASSWORD_HASH`).
- Produção: atrás do Caddy em `https://SEU_DOMINIO/painel/` (veja `DEPLOY.md`).

## Arquitetura

```
Navegador ──(cookie HttpOnly, mesma origem)──> BFF (Fastify) ──> api / profissionais / projetos / notificacoes / governanca
                                                  │──> Prometheus (consultas nomeadas) · RabbitMQ management · Loki · Jaeger
                                                  └──> SSE /painel/api/stream (visão geral em tempo real)
```
O navegador **nunca** fala com os serviços internos, nem recebe segredos; o BFF aplica autenticação e autorização no servidor. Não há acesso ao Docker Socket.

## Stack (versões fixadas)
React 19.3.1 · React Router 8.5.2 · TanStack Query 5.108 · Recharts 3.11 · Tailwind CSS 4.3.5 · Vite 8.3.8 · Vitest 5.1 + Testing Library + vitest-axe · ESLint 10 + Prettier 3.10 · Lucide.
Componentes de UI no estilo shadcn/ui (cva + tailwind-merge) escritos no próprio repositório, **sem o CLI do shadcn** (o registro não estava acessível no desenvolvimento). **TypeScript 6.0.3 no frontend** (o backend usa 7.0.2): `typescript-eslint` 8.73 ainda não aceita o TS 7 (peer `<6.1`).

## Telas
| Rota | Conteúdo | Fonte dos dados |
| --- | --- | --- |
| `/` | saúde geral, 5 serviços, KPIs, disponibilidade 24 h, eventos e notificações | serviços `/health`, Prometheus, RabbitMQ, governança — via SSE |
| `/servicos` | estado, healthcheck, latência p95, erros 1 h, dependências (somente leitura) | idem |
| `/profissionais` | busca, filtro, paginação, detalhe, cadastro | serviço de profissionais |
| `/projetos`, `/projetos/:id` | filtros, criação, finalização/reabertura, convites aceitar/recusar | serviço de projetos |
| `/recomendacoes` | pedido de equipe, resultado, histórico | API |
| `/mensageria` | filas, consumidores, taxas, erros, DLQ | RabbitMQ management |
| `/observabilidade` | métricas, logs, traces, links do Grafana | Prometheus, Loki, Jaeger |
| `/governanca` | estratégia, cache, auditoria, escalabilidade, troca manual (auditada) | governança + API |

O contrato HTTP dos serviços foi preservado: edição de profissionais não existe no serviço, então o painel não a oferece.

## Segurança
- Senha com **scrypt** (N=32768, r=8, p=1, sal aleatório, comparação em tempo constante); gerar hash: `sh scripts/hash-senha.sh`.
- Sessão **no servidor**; cookie `cb_sid` `HttpOnly; SameSite=Strict; Path=/painel; Secure` (em produção). Novo identificador a cada login. Expira por tempo absoluto (8 h) e ociosidade (30 min).
- **CSRF**: `SameSite=Strict` + verificação de `Origin`/`Sec-Fetch-Site` + token por sessão no header `x-csrf-token` em toda mutação.
- Login limitado a 5 tentativas/min/IP (429), atraso em falha, mensagem genérica (não revela se o usuário existe). Limite global de 300 req/min/IP.
- CSP restritiva (`default-src 'self'`, sem scripts inline), HSTS, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`.
- Autorização sempre no backend: todo `/painel/api/*` (exceto login) exige sessão. Parâmetros validados (UUID, enums); corpos reduzidos a campos permitidos; **sem PromQL/LogQL arbitrário** vindo do cliente; erros 5xx opacos (`502 serviço interno indisponível`).
- Tempo real: um único SSE com consolidação no servidor (cache de 5 s, máx. 20 conexões); sem sessão válida o fluxo encerra com `sessao-expirada`. Fallback para polling de 30 s após 4 falhas.
- Sem credenciais padrão: em produção `ADMIN_USER`, `ADMIN_PASSWORD_HASH` e `ADMIN_TOKEN` são obrigatórios; localmente a senha é aleatória por inicialização.

## Variáveis (BFF)
`PORT` (3010) · `PAINEL_BASE` (/painel) · `ADMIN_USER` · `ADMIN_PASSWORD_HASH` · `ADMIN_TOKEN` (token interno para governança/API) · `SESSAO_MINUTOS` (480) · `SESSAO_OCIOSA_MINUTOS` (30) · `LIMITE_LOGIN_POR_MINUTO` (5) · `COOKIE_SEGURO` · `TRUST_PROXY` · `URL_*` dos serviços · `RABBITMQ_MGMT_URL/USER/PASSWORD` · `GRAFANA_URL_PUBLICA` · `JAEGER_URL_PUBLICA` · `INTERVALO_STREAM_S` (10).

## Desenvolvimento
```
cd frontend && npm ci && npm run dev        # http://localhost:5173/painel/  (proxy /painel/api → BFF em :3010, ajustável com BFF_URL)
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
cd services/admin && npm ci && npm test      # BFF: 20 testes
```

## Hospedagem do frontend (Vercel/Render)
O painel foi projetado para **mesma origem** (cookie `SameSite=Strict`, sem CORS). Hospedá-lo separadamente na Vercel exigiria que o BFF fosse público na mesma origem (rewrite `/painel/api/*` para o BFF) — ou seja, um backend acessível pela internet, que hoje só existe se você hospedar o Compose em algum lugar. Com o backend apenas local, use `http://localhost:3010/painel/`.

## Validação realizada / limitações
Testes automatizados: frontend 33 (fluxos, formulários, SSE com fallback, estados de erro/vazio/carregamento, navegação por teclado, **axe** em login, visão geral, profissionais e governança) e BFF 20 (auth, CSRF, proxies, agregação, SSE). Integração manual: BFF servindo o `dist` do frontend, atrás do Caddy real, com roteamento, cache, compressão e SSE verificados.
**Não verificado:** renderização visual em navegador real e responsividade em dispositivos (sem navegador no ambiente de desenvolvimento) — o layout usa breakpoints Tailwind e menu lateral recolhível no móvel, mas confira visualmente; contraste de cores (o axe do jsdom não mede); build das imagens Docker; funcionamento com Prometheus/RabbitMQ/Loki/Jaeger reais.
