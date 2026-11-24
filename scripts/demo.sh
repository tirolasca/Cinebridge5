#!/bin/sh
# Auxiliar de demonstração da ATVV.
#   sh scripts/demo.sh carga [N] [pausa_s]   gera N recomendações (padrão 200) para alimentar métricas e dashboards
#   sh scripts/demo.sh convites [N]          responde convites (aceitos/recusados) em projetos existentes
#   sh scripts/demo.sh lentidao [ms]         simula recomendador principal lento (padrão 2500 ms; 0 desliga)
#   sh scripts/demo.sh estado                mostra configuração da API e estado/limiares da governança
#   sh scripts/demo.sh auditoria             mostra as últimas ações autônomas (log de auditoria)
API=${API:-http://localhost:3000}
PROJ=${PROJ:-http://localhost:3002}
GOV=${GOV:-http://localhost:3004}

case "$1" in
  carga)
    n=${2:-200}; pausa=${3:-0.2}
    generos="DOCUMENTARIO FICCAO ANIMACAO PUBLICIDADE"
    combos='"DIRETOR","EDITOR"|"DIRETOR","EDITOR","ROTEIRISTA"|"ROTEIRISTA","SONOPLASTA"|"DIRETOR","EDITOR","ROTEIRISTA","SONOPLASTA"'
    i=1
    while [ "$i" -le "$n" ]; do
      g=$(echo $generos | cut -d' ' -f$(( (i % 4) + 1 )))
      papeis=$(echo "$combos" | cut -d'|' -f$(( (i % 4) + 1 )))
      curl -s -o /dev/null -w "%{http_code} " -X POST "$API/projetos/recomendacao" \
        -H 'Content-Type: application/json' \
        -d "{\"titulo\":\"Projeto $i\",\"genero\":\"$g\",\"orcamentoTotal\":$((20000 + (i % 7) * 5000)),\"papeisRequeridos\":[$(echo "$papeis" | sed 's/"\([A-Z]*\)"/{"papel":"\1"}/g')]}"
      [ $((i % 20)) -eq 0 ] && echo " ($i/$n)"
      sleep "$pausa"; i=$((i + 1))
    done; echo ;;
  convites)
    n=${2:-30}
    ids=$(curl -s "$PROJ/projetos" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | head -n "$n")
    k=0
    for id in $ids; do
      k=$((k + 1)); aceito=true; [ $((k % 3)) -eq 0 ] && aceito=false
      curl -s -o /dev/null -X POST "$PROJ/projetos/$id/convites/profissional-$k" -H 'Content-Type: application/json' -d "{\"aceito\":$aceito}"
    done; echo "$k convites respondidos" ;;
  lentidao)
    curl -s -X POST "$API/admin/simulacao" -H 'Content-Type: application/json' -d "{\"latenciaPrincipalMs\":${2:-2500}}"; echo ;;
  estado)
    echo "--- API"; curl -s "$API/config"; echo; echo "--- Governança"; curl -s "$GOV/estado"; echo ;;
  auditoria)
    docker compose exec -T cinebridge-governanca sh -c 'tail -n 20 /data/auditoria.jsonl' ;;
  *) sed -n '2,8p' "$0" ;;
esac
