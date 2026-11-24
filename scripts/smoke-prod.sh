#!/bin/sh
# Verifica a instalação pública: HTTPS, cabeçalhos de segurança e bloqueio de rotas internas.
# Uso: sh scripts/smoke-prod.sh https://cinebridge.duckdns.org
set -u
URL="${1:?Uso: $0 https://seu-dominio}"; falhas=0
ok()  { echo "OK    $1"; }
bad() { echo "FALHA $1"; falhas=$((falhas+1)); }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }
[ "$(code "$URL/health")" = "200" ] && ok "GET /health = 200" || bad "GET /health deveria ser 200"
for rota in /metrics /config /admin/simulacao /estado; do
  c=$(code "$URL$rota"); [ "$c" = "404" ] && ok "$rota bloqueado ($c)" || bad "$rota deveria ser 404 (veio $c)"
done
h=$(curl -sI --max-time 15 "$URL/health")
echo "$h" | grep -qi '^strict-transport-security' && ok "HSTS presente" || bad "HSTS ausente"
echo "$h" | grep -qi '^x-content-type-options: nosniff' && ok "X-Content-Type-Options" || bad "X-Content-Type-Options ausente"
echo "$h" | grep -qi '^server:' && bad "cabeçalho Server exposto" || ok "Server oculto"
http="http://${URL#https://}"; c=$(code "$http/health"); case "$c" in 301|302|307|308) ok "HTTP redireciona para HTTPS ($c)";; *) bad "HTTP não redireciona ($c)";; esac
c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/painel/api/overview"); [ "$c" = "401" ] && ok "painel: API exige sessão (401)" || bad "painel: /painel/api/overview deveria ser 401 (veio $c)"
c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/painel/"); [ "$c" = "200" ] && ok "painel: SPA servida (200)" || bad "painel: /painel/ deveria ser 200 (veio $c)"
c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$URL/painel/api/auth/logout"); [ "$c" = "401" ] || [ "$c" = "403" ] && ok "painel: mutação sem sessão/CSRF recusada ($c)" || bad "painel: POST sem sessão deveria ser 401/403 (veio $c)"
c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$URL/projetos/recomendacao" -H 'content-type: application/json' -d '{}'); [ "$c" = "400" ] && ok "validação de entrada (400)" || bad "POST inválido deveria ser 400 (veio $c)"
[ "$falhas" -eq 0 ] && echo "Tudo certo." || { echo "$falhas verificação(ões) falharam."; exit 1; }
