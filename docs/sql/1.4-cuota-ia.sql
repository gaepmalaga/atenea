-- =====================================================================
-- 1.4 · Cuota de IA duradera (una fila por usuario y ruta)
-- =====================================================================
--
-- POR QUÉ HACE FALTA
--
-- La aplicación YA limita las llamadas a Gemini (`app/lib/rate-limit.ts`), pero
-- el contador vive en memoria del proceso. En un despliegue con varias
-- instancias —Vercel levanta y recicla procesos— cada una lleva su propia
-- cuenta, así que el límite real es el configurado MULTIPLICADO por el número
-- de instancias vivas.
--
-- Sirve para lo que más duele (un bucle desde una pestaña, un script tonto
-- contra una acción) y NO sirve como control de gasto exacto. Esto lo arregla.
--
-- SEGURIDAD: ejecutar DESPUÉS de `1.3-activar-rls.sql`. La tabla se crea con RLS
-- activada y sin políticas: solo la clave de servicio la toca, que es justo lo
-- que hace la aplicación.
--
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 · La tabla
-- ---------------------------------------------------------------------
create table if not exists public.ai_quota (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  bucket     text        not null,                     -- 'chat', 'plan', 'seed'…
  count      integer     not null default 0,
  reset_at   timestamptz not null,
  primary key (user_id, bucket)
);

-- Sin este índice, la limpieza del paso 4 hace un recorrido completo.
create index if not exists ai_quota_reset_at_idx on public.ai_quota (reset_at);

alter table public.ai_quota enable row level security;
-- Sin políticas a propósito: nadie llega con la clave pública. Si algún día se
-- quiere enseñar al alumno cuánta cuota le queda, se añade una de solo lectura
-- sobre `auth.uid() = user_id` — nunca de escritura, o se la reiniciaría solo.

-- ---------------------------------------------------------------------
-- PASO 2 · Consumir una unidad, de forma atómica
-- ---------------------------------------------------------------------
-- Todo en una sentencia: dos peticiones simultáneas del mismo usuario no pueden
-- leer el mismo contador y escribir ambas. Hacerlo con un SELECT y luego un
-- UPDATE desde la aplicación deja justo ese hueco.
--
-- Devuelve: allowed (si pasa), remaining (lo que le queda), reset_at.
create or replace function public.consume_ai_quota(
  p_user_id  uuid,
  p_bucket   text,
  p_limit    integer,
  p_window   interval
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count    integer;
  v_reset    timestamptz;
begin
  insert into public.ai_quota (user_id, bucket, count, reset_at)
  values (p_user_id, p_bucket, 1, now() + p_window)
  on conflict (user_id, bucket) do update
    set count    = case when public.ai_quota.reset_at <= now() then 1
                        else public.ai_quota.count + 1 end,
        reset_at = case when public.ai_quota.reset_at <= now() then now() + p_window
                        else public.ai_quota.reset_at end
  returning public.ai_quota.count, public.ai_quota.reset_at into v_count, v_reset;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_reset;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, text, integer, interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- PASO 3 · Comprobar que funciona
-- ---------------------------------------------------------------------
-- Sustituye el UUID por uno real de `auth.users`. Con límite 2, la tercera
-- llamada tiene que devolver allowed = false.
--
--   select * from public.consume_ai_quota('UUID-AQUI', 'prueba', 2, interval '1 hour');
--   select * from public.consume_ai_quota('UUID-AQUI', 'prueba', 2, interval '1 hour');
--   select * from public.consume_ai_quota('UUID-AQUI', 'prueba', 2, interval '1 hour');  -- allowed = false
--   delete from public.ai_quota where bucket = 'prueba';

-- ---------------------------------------------------------------------
-- PASO 4 · Limpieza
-- ---------------------------------------------------------------------
-- Las filas expiradas no molestan (el paso 2 las reinicia al vuelo), pero la
-- tabla crece con cada usuario que pasa. Con pg_cron:
--
--   select cron.schedule('limpiar-ai-quota', '0 4 * * *',
--     $$ delete from public.ai_quota where reset_at < now() - interval '1 day' $$);
--
-- Sin pg_cron, ejecutar el DELETE a mano de vez en cuando. No corre prisa.

-- ---------------------------------------------------------------------
-- PASO 5 · Enchufarlo en la aplicación
-- ---------------------------------------------------------------------
-- `checkQuota` ya es `async` y las nueve llamadas ya la esperan con `await`,
-- así que el cambio es local a `app/lib/rate-limit.ts`:
--
--   const { data } = await supabase.rpc('consume_ai_quota', {
--     p_user_id: userId, p_bucket: name,
--     p_limit: QUOTAS[name].limit,
--     p_window: `${QUOTAS[name].windowMs} milliseconds`,
--   });
--
-- Los límites (`QUOTAS`) se quedan en el código: son producto, no esquema.
-- Y conviene dejar el contador en memoria como respaldo: si la consulta falla,
-- es mejor limitar de más que no limitar.

-- ---------------------------------------------------------------------
-- MARCHA ATRÁS
-- ---------------------------------------------------------------------
-- drop function if exists public.consume_ai_quota(uuid, text, integer, interval);
-- drop table if exists public.ai_quota;
