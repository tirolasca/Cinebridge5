# Definição comum: CINEBRIDGE_ENV=local (padrão: prod se .env.prod existir) escolhe os arquivos do Compose.
if [ "${CINEBRIDGE_ENV:-}" = "local" ] || [ ! -f .env.prod ]; then
  DC="docker compose -f docker-compose.yml"
else
  DC="docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml"
fi
BANCOS="profissionais-db:profissionais projetos-db:projetos notificacoes-db:notificacoes recomendacoes-db:recomendacoes"
