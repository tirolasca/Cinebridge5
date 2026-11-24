#!/bin/sh
# Restaura os bancos a partir de um backup. DESTRUTIVO para o conteúdo atual dos bancos (pg_restore --clean).
# Uso: sh scripts/restore.sh backups/AAAAMMDD-HHMMSS [banco ...]   (sem bancos = todos)
set -e
. "$(dirname "$0")/_compose.sh"
ORIGEM="$1"; [ -d "$ORIGEM" ] || { echo "Uso: $0 <diretório-do-backup> [profissionais|projetos|notificacoes|recomendacoes ...]"; exit 1; }
shift || true
( cd "$ORIGEM" && sha256sum -c SHA256SUMS )
ALVOS="${*:-profissionais projetos notificacoes recomendacoes}"
printf 'Isto SOBRESCREVE os dados atuais de: %s. Digite "restaurar" para continuar: ' "$ALVOS"; read -r r; [ "$r" = "restaurar" ] || exit 1
for db in $ALVOS; do
  svc="$db-db"
  echo "restaurando $db ..."
  $DC exec -T "$svc" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$ORIGEM/$db.dump"
done
echo "Pronto. Reinicie os serviços para limpar caches: $DC restart"
