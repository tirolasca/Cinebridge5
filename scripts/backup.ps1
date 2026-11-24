# Backup dos 4 PostgreSQL + definições do RabbitMQ (PowerShell). Uso: .\scripts\backup.ps1 [-Destino pasta]
param([string]$Destino = "backups\$(Get-Date -Format 'yyyyMMdd-HHmmss')")
$ErrorActionPreference = 'Stop'
if (Test-Path .env.prod) { $dc = @('compose','--env-file','.env.prod','-f','docker-compose.yml','-f','docker-compose.prod.yml') } else { $dc = @('compose','-f','docker-compose.yml') }
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
foreach ($db in 'profissionais','projetos','notificacoes','recomendacoes') {
  Write-Host "dump $db ..."
  # --no-TTY e redirecionamento binário: usa o shell do container para gravar dentro e copiar depois
  & docker @dc exec -T "$db-db" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner -f /tmp/backup.dump'
  & docker @dc cp "$db-db:/tmp/backup.dump" "$Destino\$db.dump"
  if ((Get-Item "$Destino\$db.dump").Length -eq 0) { throw "dump vazio para $db" }
}
& docker @dc exec -T cinebridge-mq rabbitmqctl export_definitions /tmp/definicoes.json | Out-Null
& docker @dc cp "cinebridge-mq:/tmp/definicoes.json" "$Destino\rabbitmq-definicoes.json"
Write-Host "Backup concluído em $Destino"
