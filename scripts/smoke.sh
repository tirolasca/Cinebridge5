#!/bin/sh
# Teste ponta a ponta: API -> RabbitMQ -> profissionais / projetos -> RabbitMQ -> notificações
# + verificação do stack de observabilidade (ATVV).
# Uso: sh scripts/smoke.sh   (com o ambiente no ar)
set -e
API=${API:-http://localhost:3000}

for porta in 3000 3001 3002 3003 3004; do
  printf 'health %s: ' "$porta"
  curl -fsS "http://localhost:$porta/health"; echo
done

echo "--- POST /projetos/recomendacao"
curl -fsS -D /tmp/cb-headers -X POST "$API/projetos/recomendacao" \
  -H 'Content-Type: application/json' \
  -d '{
    "titulo": "Raízes do Sertão", "genero": "documentario", "orcamentoTotal": 40000,
    "papeisRequeridos": [
      { "papel": "DIRETOR" }, { "papel": "EDITOR" },
      { "papel": "ROTEIRISTA" }, { "papel": "SONOPLASTA" }
    ]
  }'
echo
TRACE=$(grep -i '^x-correlation-id' /tmp/cb-headers | tr -d '\r' | cut -d' ' -f2)
echo "trace/correlation id: $TRACE  ->  http://localhost:16686/trace/$TRACE"

sleep 2
echo "--- projetos registrados (porta 3002)";   curl -fsS http://localhost:3002/projetos | head -c 400; echo
echo "--- notificações geradas (porta 3003)";   curl -fsS http://localhost:3003/notificacoes | head -c 400; echo

echo "--- /metrics expostos"
for porta in 3000 3001 3002 3003 3004; do
  printf '%s: ' "$porta"; curl -fsS "http://localhost:$porta/metrics" | grep -c '^cinebridge_' | xargs echo "séries cinebridge_*"
done

echo "--- stack de observabilidade"
curl -fsS http://localhost:9090/-/healthy && echo " prometheus ok"
curl -fsS http://localhost:3005/api/health | head -c 120; echo " (grafana)"
curl -fsS "http://localhost:9090/api/v1/targets" | grep -o '"health":"[a-z]*"' | sort | uniq -c
echo "Grafana: http://localhost:3005 | Prometheus: http://localhost:9090 | Jaeger: http://localhost:16686 | RabbitMQ: http://localhost:15672"
