# Gera o hash scrypt da senha do administrador (PowerShell). Copie o resultado para ADMIN_PASSWORD_HASH no .env.prod
$ErrorActionPreference = 'Stop'
docker build -q -f services/admin/Dockerfile -t cinebridge-admin-hash . | Out-Null
docker run --rm -it cinebridge-admin-hash node dist/hash-senha.js
