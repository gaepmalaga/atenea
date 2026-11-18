-- =============================================================================
-- Último acceso de cada usuario: cuándo usó la app, no cuándo escribió la clave
-- =============================================================================
--
-- POR QUÉ
-- «Último acceso» (Logs y el aviso de «hace días que no entra» de Alumnos)
-- salía de `auth.users.last_sign_in_at`, que solo cambia al INICIAR SESIÓN de
-- verdad. Quien deja la sesión abierta en el móvil la renueva sola cada hora y
-- no vuelve a iniciarla: el dueño estaba conectado y los Logs decían «hace 4
-- días». Supabase guarda cada sesión con su última renovación
-- (`auth.sessions.refreshed_at`), que se mueve cada vez que se usa la app (como
-- mucho, con una hora de retraso). Esta función da, por usuario, la más
-- reciente entre las dos fechas.
--
-- SOLO LEE `auth.users` y `auth.sessions`; no cambia ningún dato. Solo la
-- clave de servicio puede llamarla (la app es la única que la usa). Seguro de
-- repetir.
--
-- CÓMO: Supabase → SQL Editor → pegar todo esto → Run.
-- =============================================================================

create or replace function public.ultimo_acceso_usuarios()
returns table (user_id uuid, ultimo_acceso timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         greatest(u.last_sign_in_at, max(s.refreshed_at::timestamptz), max(s.updated_at::timestamptz))
  from auth.users u
  left join auth.sessions s on s.user_id = u.id
  group by u.id, u.last_sign_in_at
$$;

revoke all on function public.ultimo_acceso_usuarios() from public, anon, authenticated;
grant execute on function public.ultimo_acceso_usuarios() to service_role;
