# Gera .env.prod com segredos aleatórios (PowerShell 5.1+ / 7). Não sobrescreve se já existir.
if (Test-Path .env.prod) { Write-Host ".env.prod já existe; nada feito."; exit 0 }
function Seg { $b = New-Object byte[] 24; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ([BitConverter]::ToString($b) -replace '-', '').ToLower() }
$campos = 'ADMIN_TOKEN','RABBITMQ_PASSWORD','PROFISSIONAIS_DB_PASSWORD','PROJETOS_DB_PASSWORD','NOTIFICACOES_DB_PASSWORD','RECOMENDACOES_DB_PASSWORD','GRAFANA_PASSWORD'
$linhas = Get-Content .env.prod.example | ForEach-Object {
  $l = $_; foreach ($c in $campos) { if ($l -match "^$c=") { $l = "$c=$(Seg)" } }; $l
}
Set-Content -Path .env.prod -Value $linhas -Encoding utf8
Write-Host ".env.prod criado. Edite DOMAIN e ACME_EMAIL antes de subir."
