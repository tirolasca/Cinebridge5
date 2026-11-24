#!/bin/sh
# Backup lógico dos 4 PostgreSQL (pg_dump, formato custom, comprimido) + definições do RabbitMQ.
# Uso: sh scripts/backup.sh [diretório]   (padrão: ./backups/AAAAMMDD-HHMMSS ; mantém os 7 mais recentes)
set -e
. "$(dirname "$0")/_compose.sh"
DESTINO="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$DESTINO"
for par in $BANCOS; do
  svc=${par%%:*}; db=${par##*:}
  echo "dump $db ..."
  $DC exec -T "$svc" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$DESTINO/$db.dump"
  [ -s "$DESTINO/$db.dump" ] || { echo "ERRO: dump vazio para $db" >&2; exit 1; }
done
echo "definições do RabbitMQ ..."
$DC exec -T cinebridge-mq rabbitmqctl export_definitions /tmp/definicoes.json >/dev/null
$DC exec -T cinebridge-mq cat /tmp/definicoes.json > "$DESTINO/rabbitmq-definicoes.json"
( cd "$DESTINO" && sha256sum * > SHA256SUMS )
echo "Backup concluído em $DESTINO"
# rotação: mantém os 7 diretórios mais recentes em backups/
[ -d backups ] && ls -1dt backups/*/ 2>/dev/null | tail -n +8 | xargs -r rm -rf
