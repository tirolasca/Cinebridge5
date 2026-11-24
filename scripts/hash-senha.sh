#!/bin/sh
# Gera o hash scrypt da senha do administrador do Control Center (a senha é digitada sem eco).
# Uso: sh scripts/hash-senha.sh   -> copie a linha impressa para ADMIN_PASSWORD_HASH no .env.prod
set -e
docker build -q -f services/admin/Dockerfile -t cinebridge-admin-hash . >/dev/null
docker run --rm -it cinebridge-admin-hash node dist/hash-senha.js
