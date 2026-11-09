-- =============================================================================
-- EL EJEMPLO DE FÍSICA PASA A SER EL ENTRENO DE UN ALUMNO (regla 98, 9 nov 2026)
-- =============================================================================
--
-- Lo pidió el dueño: retirar el grupo de ejemplo «Promo 43 · Físicas» (sin
-- horario: un plan común, el modelo de antes) y poner sus sesiones de ejemplo
-- a un ALUMNO DE PRUEBA, para que los dueños vean cómo queda un entreno
-- individual y cómo se copia de un alumno a otro.
--
--   1. Cuenta nueva, prueba.entreno@alphapol.es (alumno, correo confirmado,
--      acceso activo y exento, como prueba.alumno). La CONTRASEÑA no está
--      aquí: se pone aparte al ejecutarlo y la tiene el dueño.
--   2. prueba.entreno entra en Kappa y prueba.alumno en Alpha: así los dos
--      salen en «Planificar» y en el cuadrante.
--   3. Las 29 sesiones del grupo de ejemplo y las 2 individuales de
--      prueba.alumno («Extra: dominadas negativas») pasan a ser entrenos de
--      prueba.entreno: las 31. Con ellas, lo que apuntó prueba.alumno (5, una
--      con respuesta del preparador) y las 5 notas de semana.
--   4. Se borra el grupo «Promo 43 · Físicas» (ya vacío de sesiones y notas;
--      se va también la pertenencia de prueba.alumno).
--   5. Se borra la sesión «Jdjd» de Kappa del lunes 9 (una prueba del dueño).
--
-- No se tocan: las plantillas, las marcas y el 1RM de prueba.alumno, el grupo
-- de teoría «Promo 43», ni los grupos de la Promoción 44.
-- =============================================================================

begin;

do $$
declare g record;
begin
  select * into g from public.class_groups where id = '65f71522-06fb-4dfd-8294-ab0b20d13438';
  if not found then raise exception 'El grupo de ejemplo ya no existe.'; end if;
  if g.weekdays is not null and array_length(g.weekdays, 1) > 0 then
    raise exception 'El grupo de ejemplo tiene horario: no es el que se esperaba.';
  end if;
  if exists (select 1 from public.class_members m join public.profiles p on p.id = m.user_id
              where m.class_id = g.id and p.email <> 'prueba.alumno@alphapol.es') then
    raise exception 'El grupo de ejemplo tiene alumnos de verdad: no se toca.';
  end if;
end $$;

-- 1 · La cuenta (los disparadores crean su perfil de alumno y la meten en Alphapol)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', 'ab587369-f2a7-4460-9251-c4800f1eb87a',
       'authenticated', 'authenticated', 'prueba.entreno@alphapol.es', null, now(),
       '', '', '', '',
       '{"provider":"email","providers":["email"]}'::jsonb, '{"email_verified":true}'::jsonb, now(), now()
 where not exists (select 1 from auth.users where email = 'prueba.entreno@alphapol.es');

insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at)
select 'ab587369-f2a7-4460-9251-c4800f1eb87a', 'email', 'ab587369-f2a7-4460-9251-c4800f1eb87a',
       jsonb_build_object('sub', 'ab587369-f2a7-4460-9251-c4800f1eb87a', 'email', 'prueba.entreno@alphapol.es',
                          'email_verified', false, 'phone_verified', false),
       now(), now()
 where not exists (select 1 from auth.identities where user_id = 'ab587369-f2a7-4460-9251-c4800f1eb87a');

insert into public.memberships (user_id, organization_id, access_status, payment_status, note, exempt)
values ('ab587369-f2a7-4460-9251-c4800f1eb87a', 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2', 'active', 'al_dia',
        'Cuenta de prueba: el entreno de ejemplo, para los dueños de Alphapol', true)
on conflict (organization_id, user_id) do nothing;

-- 2 · Los grupos: prueba.entreno en Kappa, prueba.alumno en Alpha
insert into public.class_members (class_id, user_id) values
  ('ae6d2474-1bf5-4eaf-b2ef-0159efd2d01e', 'ab587369-f2a7-4460-9251-c4800f1eb87a'),
  ('130a0d55-1e32-49ff-b67d-d9201baa3e4b', '230d0bf7-330c-4037-83b5-0a6ba92e7c35')
on conflict do nothing;

-- 3 · Las 31 sesiones de ejemplo, entrenos de prueba.entreno
update public.training_sessions
   set user_id = 'ab587369-f2a7-4460-9251-c4800f1eb87a', class_id = null, updated_at = now()
 where class_id = '65f71522-06fb-4dfd-8294-ab0b20d13438';

update public.training_sessions
   set user_id = 'ab587369-f2a7-4460-9251-c4800f1eb87a', updated_at = now()
 where user_id = '230d0bf7-330c-4037-83b5-0a6ba92e7c35'
   and title = 'Extra: dominadas negativas'
   and created_at < '2026-11-07';

update public.training_session_logs
   set user_id = 'ab587369-f2a7-4460-9251-c4800f1eb87a'
 where user_id = '230d0bf7-330c-4037-83b5-0a6ba92e7c35'
   and session_id in (select id from public.training_sessions where user_id = 'ab587369-f2a7-4460-9251-c4800f1eb87a');

update public.training_week_notes
   set user_id = 'ab587369-f2a7-4460-9251-c4800f1eb87a', class_id = null, updated_at = now()
 where class_id = '65f71522-06fb-4dfd-8294-ab0b20d13438';

-- 4 · Fuera el grupo de ejemplo
delete from public.class_groups where id = '65f71522-06fb-4dfd-8294-ab0b20d13438';

-- 5 · Fuera la sesión «Jdjd» de Kappa (lunes 9)
delete from public.training_sessions where id = 'd788e065-07e9-405f-9d1d-90d9a9eb6069' and title = 'Jdjd';

commit;

-- COMPROBACIÓN
--   select count(*) from training_sessions where user_id = 'ab587369-f2a7-4460-9251-c4800f1eb87a';  -- 31
--   select count(*) from training_sessions where class_id is not null;                             -- 0
--   select name from class_groups where kind = 'fisicas' order by created_at;                      -- los 8 de la Promoción 44
