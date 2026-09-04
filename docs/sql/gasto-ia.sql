-- ============================================================================
-- EL GASTO DE IA, PERSISTIDO
--
-- QUÉ RESUELVE
-- Los topes de `rate-limit.ts` cuentan LLAMADAS, y esa no es la unidad que
-- cuesta: una pregunta al chat sobre el tema 7 son 34.675 tokens de entrada y
-- sobre el tema más corto 1.419. Son 25×, y hoy las dos cuentan como «una».
-- Un tope en llamadas acota la ráfaga; no acota la factura.
--
-- Desde `app/lib/ai-usage.ts` ya se registra el gasto de cada llamada en el
-- log del servidor (líneas `[gasto-ia] …`), así que se pueden ver números
-- reales HOY. Esto es el paso siguiente: guardarlos para poder sumar por
-- alumno, por ruta y por mes, y para poder poner topes en la unidad correcta.
--
-- ES IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
--
-- POR QUÉ NO ESTÁ YA EL CÓDIGO QUE ESCRIBE AQUÍ
-- Regla del repo: no se escribe el código antes de que exista la columna.
-- PostgREST rechaza la escritura ENTERA si falta una sola, y así estuvo roto
-- meses el guardado de tests sin que nadie lo viera.
-- ============================================================================

create table if not exists public.ai_usage (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  -- 'chat', 'ficha', 'pregunta', 'entrevista', 'informe', 'plan'.
  -- Texto y no un enum a propósito: añadir una ruta no puede exigir una
  -- migración, o se acabará metiendo en la que ya existe y falseando el dato.
  route       text        not null,
  input_tokens   integer  not null default 0,
  output_tokens  integer  not null default 0,
  -- Tokens servidos desde la caché del modelo. Se guardan aparte porque son la
  -- forma de saber si la caché compensa, que es una decisión pendiente.
  cached_tokens  integer  not null default 0,
  -- En dólares. `numeric` y no `float`: sumar dinero en coma flotante acumula
  -- error, y este número va a acabar en una factura.
  cost_usd    numeric(12, 6) not null default 0,
  -- El tema, cuando la llamada lo tiene. Es lo que explica por qué una llamada
  -- costó 25× más que otra; sin él, el dato no sirve para decidir nada.
  subject_id  integer,
  created_at  timestamptz not null default now()
);

-- Las tres consultas que se van a hacer de verdad: «cuánto lleva este alumno
-- este mes», «cuánto gasta cada ruta» y «qué pasó ayer».
create index if not exists ai_usage_user_fecha  on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_ruta_fecha  on public.ai_usage (route, created_at desc);

alter table public.ai_usage enable row level security;

-- CERO POLÍTICAS, y es deliberado. Esta tabla es de administración: la escribe
-- el servidor con la clave de servicio y la lee el panel de academia, también
-- con la clave de servicio y detrás de `requireAdmin`. Un alumno no tiene por
-- qué poder leer cuánto gasta él ni nadie.
--
-- Ojo con el modo de fallo de la regla 34: si algún día se lee esto con el
-- cliente de la SESIÓN, Postgres no protesta — devuelve cero filas y el panel
-- sale en blanco sin que nadie sepa por qué.

-- ---------------------------------------------------------------------------
-- El tope en la unidad que de verdad cuesta.
--
-- Devuelve lo gastado por un usuario en una ventana. Con esto, `checkQuota`
-- puede cortar por DINERO en vez de por número de llamadas.
-- ---------------------------------------------------------------------------
create or replace function public.gasto_en_ventana(
  p_user_id uuid,
  p_window  interval
)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)
  from public.ai_usage
  where user_id = p_user_id
    and created_at >= now() - p_window;
$$;

revoke all on function public.gasto_en_ventana(uuid, interval) from public, anon, authenticated;
