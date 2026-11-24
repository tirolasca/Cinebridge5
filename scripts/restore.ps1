# Restaura bancos de um backup (DESTRUTIVO). Uso: .\scripts\restore.ps1 -Origem backups\AAAAMMDD-HHMMSS [-Bancos profissionais,projetos]
param([Parameter(Mandatory)][string]$Origem, [string[]]$Bancos = @('profissionais','projetos','notificacoes','recomendacoes'))
$ErrorActionPreference = 'Stop'
if (Test-Path .env.prod) { $dc = @('compose','--env-file','.env.prod','-f','docker-compose.yml','-f','docker-compose.prod.yml') } else { $dc = @('compose','-f','docker-compose.yml') }
if ((Read-Host "Isto SOBRESCREVE os dados de: $($Bancos -join ', '). Digite 'restaurar'") -ne 'restaurar') { exit 1 }
foreach ($db in $Bancos) {
  Write-Host "restaurando $db ..."
  & docker @dc cp "$Origem\$db.dump" "$db-db:/tmp/restore.dump"
  & docker @dc exec -T "$db-db" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner /tmp/restore.dump'
}
Write-Host "Pronto. Reinicie os serviços: docker compose restart"
