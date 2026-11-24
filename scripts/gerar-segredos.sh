#!/bin/sh
# Gera .env.prod a partir de .env.prod.example com segredos aleatórios (não sobrescreve se já existir).
set -e
[ -f .env.prod ] && { echo ".env.prod já existe; nada feito."; exit 0; }
seg() { openssl rand -hex 24; }
sed -e "s|^ADMIN_TOKEN=.*|ADMIN_TOKEN=$(seg)|" \
    -e "s|^RABBITMQ_PASSWORD=.*|RABBITMQ_PASSWORD=$(seg)|" \
    -e "s|^PROFISSIONAIS_DB_PASSWORD=.*|PROFISSIONAIS_DB_PASSWORD=$(seg)|" \
    -e "s|^PROJETOS_DB_PASSWORD=.*|PROJETOS_DB_PASSWORD=$(seg)|" \
    -e "s|^NOTIFICACOES_DB_PASSWORD=.*|NOTIFICACOES_DB_PASSWORD=$(seg)|" \
    -e "s|^RECOMENDACOES_DB_PASSWORD=.*|RECOMENDACOES_DB_PASSWORD=$(seg)|" \
    -e "s|^GRAFANA_PASSWORD=.*|GRAFANA_PASSWORD=$(seg)|" \
    .env.prod.example > .env.prod
chmod 600 .env.prod
echo ".env.prod criado. Edite DOMAIN e ACME_EMAIL antes de subir."
