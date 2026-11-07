#!/bin/bash
# SQL contra el proyecto REAL de Supabase, desde una sesión de Claude en la nube.
#
#   scripts/nube/sql.sh "select count(*) from question_bank"
#
# Va por la API de gestión de Supabase con un token de cuenta guardado como
# secreto de red del entorno para api.supabase.com: aquí se escribe
# «proxy-injected» y el proxy pone el valor de verdad. El token NO está en el
# repositorio ni se imprime. Sin ese secreto, devuelve 401.
#
# Es la base de datos de PRODUCCIÓN: lee lo que quieras, pero cualquier cambio
# de datos se deshace al terminar, y nunca se borra nada real.
REF=ecupmlqimmpybbrlrmpx
python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$1" \
  | curl -sS -m 60 -X POST \
      -H "Authorization: Bearer proxy-injected" -H "Content-Type: application/json" \
      --data @- "https://api.supabase.com/v1/projects/$REF/database/query"
echo
