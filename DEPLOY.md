# Implantação em produção (VM Linux com Docker)

> **Estado desta entrega:** os arquivos de produção foram validados com `docker compose config` (Compose v5.8), typecheck, testes e build.
> **Nenhuma imagem foi construída e nenhum container foi iniciado** durante o desenvolvimento (ambiente sem Docker daemon), e **nada foi publicado**.
> Siga o passo 7 (smoke test) para confirmar cada etapa no seu servidor.

## 0. Onde hospedar sem cartão de crédito — leia primeiro

Levantamento feito em nov/2026 (condições mudam; confirme nos sites oficiais):

| Opção | Cartão? | Comporta a stack? |
| --- | --- | --- |
| Oracle Cloud Always Free (2 OCPU / 12 GB ARM, cota reduzida em jun/2026) | **Sim** (verificação) | Sim — mas você não tem cartão |
| Google Cloud e2-micro (1 GB) / AWS / Azure | **Sim** | Não comporta |
| Koyeb | Sim desde fev/2026 | — |
| Render (free) | Varia por fonte para web services | **Não**: 512 MB, dorme após 15 min, sem RabbitMQ, sem disco persistente |
| Railway (plano free) | Não | **Não**: US$1/mês de crédito, 0,5 GB por serviço |

**Conclusão técnica:** não há VM gratuita, permanente e sem cartão capaz de rodar 5 microsserviços + RabbitMQ + 4 PostgreSQL. Caminhos viáveis:

1. **Computador/servidor seu** (PC, notebook antigo, mini-PC, Raspberry Pi 4/5 de 4 GB+ — as imagens suportam ARM64 e AMD64) ligado 24 h, com Docker. É gratuito, sem cartão e usa exatamente este projeto. Requer acesso ao roteador (encaminhar portas 80/443) e IP público que não esteja atrás de CGNAT (confira com seu provedor).
2. **Cartão de terceiros/virtual** para a Oracle (por exemplo, cartão virtual de um banco digital) — só se a pessoa responsável concordar; o projeto está pronto para essa VM.
3. **Demonstração acadêmica local** (`docker compose up`), sem hospedagem pública.

O restante deste guia vale para qualquer VM/servidor Linux (Ubuntu 24.04+) com Docker Engine e Compose ≥ 2.24.

## 1. Domínio gratuito (DuckDNS)

1. Entre em https://www.duckdns.org (login por conta Google/GitHub, sem cartão) e crie um subdomínio, ex.: `cinebridge.duckdns.org`.
2. Aponte para o IP público do servidor (para casa: o IP do seu roteador).
3. Mantenha o IP atualizado se ele mudar (cron com a URL de atualização do DuckDNS).
4. O Caddy emite o certificado Let's Encrypt automaticamente por HTTP-01: portas **80 e 443** precisam estar acessíveis da internet.

## 2. Preparar o servidor

```bash
sudo apt update && sudo apt install -y git openssl ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER   # relogue depois
docker compose version   # precisa ser >= 2.24
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```
Windows 10/11 com Docker Desktop também funciona para testes; para produção 24 h prefira Linux.

## 3. Obter o código e configurar segredos

```bash
git clone https://github.com/tirolasca/Cinebridge5.git && cd Cinebridge5
sh scripts/gerar-segredos.sh          # cria .env.prod com senhas aleatórias (chmod 600)
nano .env.prod                        # ajuste DOMAIN e ACME_EMAIL
```
PowerShell: `.\scripts\gerar-segredos.ps1`. O `.env.prod` **nunca** deve ir para o Git (já está no `.gitignore`).

### Senha do Control Center
```bash
sh scripts/hash-senha.sh     # PowerShell: .\scripts\hash-senha.ps1 — digite a senha (mín. 12 caracteres) e copie o hash
nano .env.prod               # cole em ADMIN_PASSWORD_HASH e defina ADMIN_USER
```
O painel fica em `https://SEU_DOMINIO/painel/`.

## 4. Subir

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps
```
Consumo esperado (limites configurados): ≈ 1,8 GB para o perfil padrão (12 containers). Com 2 GB de RAM totais, adicione swap; o recomendado é ≥ 4 GB.

Observabilidade completa (Grafana, Loki, Alloy, Jaeger, cAdvisor), opcional e mais pesada (+≈ 1,1 GB):
```bash
... up -d --build --profile observabilidade-completa
```
Nenhuma ferramenta interna é publicada na internet. Para abrir Grafana/Jaeger/Prometheus use o override `docker-compose.ui.yml` (publica só em `127.0.0.1` do servidor) e um túnel SSH — o comando está no cabeçalho do arquivo. (O Alloy monta `docker.sock` somente-leitura para coletar logs; por isso fica no profile opcional.)

## 5. O que fica público e o que não fica

- Público: somente o Caddy (80/443) → `/painel*` para o Control Center (`cinebridge-admin:3010`) e o restante para `cinebridge-api:3000`. `/metrics`, `/config`, `/admin/*` e `/estado` retornam 404 no proxy.
- Interno (rede `cinebridge-net`): demais serviços, PostgreSQL, RabbitMQ, Prometheus.
- A API aplica: Helmet, CORS por lista (`CORS_ORIGINS`), rate limit por IP (`RATE_LIMIT_MAX`), corpo ≤ 100 KB, erros 5xx sem detalhes internos.
- A governança em produção **não tem escalonamento horizontal nem rotação por volume** (não monta `docker.sock`). Seguem ativas: troca de estratégia, ajuste de cache e auditoria; limites de retenção do Prometheus/Docker continuam valendo.

## 6. Backup e restauração

```bash
sh scripts/backup.sh                       # ./backups/AAAAMMDD-HHMMSS (mantém os 7 mais recentes)
sh scripts/restore.sh backups/20261120-030000 projetos   # restaura só o banco "projetos" (pede confirmação)
```
PowerShell: `.\scripts\backup.ps1` / `.\scripts\restore.ps1 -Origem backups\... -Bancos projetos`.

Agende e **copie os backups para fora do servidor** (ex.: `rclone` para um drive):
```bash
( crontab -l 2>/dev/null; echo '0 3 * * * cd ~/Cinebridge5 && sh scripts/backup.sh >> backups/cron.log 2>&1' ) | crontab -
```
Teste a restauração em ambiente de teste antes de precisar dela. As migrações do projeto são aditivas (`create table if not exists`, `add column if not exists`); nada apaga dados.

## 7. Validar

```bash
sh scripts/smoke-prod.sh https://cinebridge.duckdns.org   # HTTPS, HSTS, rotas internas 404, validação de entrada
sh scripts/diagnostico.sh                                  # estado, memória, filas, erros recentes
```

## 8. CI/CD (GitHub Actions)

`ci.yml` roda em todo push/PR: lockfile (`npm ci`), tipos, testes, build, `npm audit`, `docker compose config` (local e produção), Hadolint, build das imagens, verificação de usuário não-root e Trivy.
`deploy.yml` (SSH, só após CI verde na `main` ou manual) exige o Environment **producao** com os secrets:

| Secret | Conteúdo |
| --- | --- |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_PATH` | servidor, usuário, pasta do clone |
| `DEPLOY_SSH_KEY` | chave privada **exclusiva** do deploy (`ssh-keygen -t ed25519`) |
| `DEPLOY_KNOWN_HOSTS` | saída de `ssh-keyscan -t ed25519 SEU_HOST` |
| `DEPLOY_URL` | `https://cinebridge.duckdns.org` |

Os segredos da aplicação ficam apenas no `.env.prod` do servidor. O deploy faz backup antes de atualizar.

## 9. Atualizar versões no futuro
1. `npm outdated` em cada serviço; leia os changelogs; atualize um por vez com `npm i --save-exact`.
2. Imagens: troque as tags em `docker-compose.yml`/`docker-compose.prod.yml` (nunca `latest`), leia as notas de versão (Grafana, Loki e Jaeger têm breaking changes frequentes) e valide localmente antes.
3. PostgreSQL: atualizações de **major** exigem dump/restore (`scripts/backup.sh` → subir nova versão → `scripts/restore.sh`); minor/patch trocam só a imagem.
4. Rode `docker compose ... up -d --build` e depois `scripts/smoke-prod.sh`.

## 10. Limitações
- Sem hospedagem gratuita em nuvem sem cartão que comporte a stack (seção 0).
- Prometheus em produção usa alvos estáticos: réplicas dinâmicas só existem no ambiente local (`docker.sock`).
- Os convites e a receita potencial seguem sendo métricas/contadores, sem persistência de convites.
