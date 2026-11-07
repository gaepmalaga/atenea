#!/bin/bash
# Arranca la app en local (puerto 3100) contra la base de datos REAL, desde una
# sesión de Claude en la nube. Para probar una pantalla con datos de verdad y
# las cuentas de prueba (docs/TRASPASO.md).
#
#   scripts/nube/arrancar-local.sh > /tmp/dev.log 2>&1 &
#
# Las claves de Supabase se piden a la API de gestión en el momento (mismo
# secreto de red que sql.sh), viven solo en el entorno de este proceso y no se
# escriben ni se imprimen. Gemini va con una clave falsa: lo que llame a la IA
# falla en local (para probarlo, hazlo en producción).
#
# NODE_USE_ENV_PROXY=1: sin él, Node no pasa por el proxy de la sesión.
cd "$(dirname "$0")/../.." || exit 1
REF=ecupmlqimmpybbrlrmpx
CLAVES=$(curl -sS -m 30 -H "Authorization: Bearer proxy-injected" "https://api.supabase.com/v1/projects/$REF/api-keys")
clave() { echo "$CLAVES" | python3 -c "import json,sys; print([k['api_key'] for k in json.load(sys.stdin) if k['name']=='$1'][0])"; }
export SUPABASE_SERVICE_ROLE_KEY=$(clave service_role)
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(clave anon)
export NEXT_PUBLIC_SUPABASE_URL=https://$REF.supabase.co
export GEMINI_API_KEY=no-se-usa
export NODE_USE_ENV_PROXY=1
exec npx next dev --webpack -p 3100
