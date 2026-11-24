#!/bin/sh
# Diagnóstico rápido do ambiente em execução (estado, saúde, memória, últimos erros).
. "$(dirname "$0")/_compose.sh"
echo "== containers"; $DC ps
echo; echo "== memória/CPU"; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($DC ps -q) 2>/dev/null
echo; echo "== saúde interna (via container da API)"
for s in cinebridge-api:3000 cinebridge-profissionais:3001 cinebridge-projetos:3002 cinebridge-notificacoes:3003 cinebridge-governanca:3004; do
  printf '%s: ' "$s"; $DC exec -T cinebridge-api wget -qO- "http://$s/health" 2>/dev/null || echo "sem resposta"; echo
done
echo "== filas RabbitMQ"; $DC exec -T cinebridge-mq rabbitmqctl list_queues name messages consumers 2>/dev/null
echo; echo "== erros recentes (30 linhas)"; $DC logs --since 30m --no-color 2>/dev/null | grep -E '"nivel":"(error|fatal)"' | tail -30
