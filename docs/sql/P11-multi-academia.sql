-- =============================================================================
-- P11 — Multi-academia: los cimientos (academies, organization_id en cascada)
-- =============================================================================
--
-- ✅ EJECUTADO (11 sep 2026) y VERIFICADO (12 sep 2026, `node
-- scripts/schema-snapshot.mjs` + las consultas del PASO 9 contra el proyecto
-- real): las 38 tablas incluyen `academies`/`academy_members`, los tres
-- singleton perdieron su columna `id`, `organization_id` está poblado en todo
-- lo que debía (`class_groups`, `group_kinds`, `academy_staff`,
-- `memberships`, `monthly_payments`, `academy_settings`,
-- `membership_settings`, `academy_convocatoria`), `question_bank` se quedó
-- con sus 1000 filas en `organization_id = NULL` (el banco global), y RLS con
-- la clave anónima devuelve 0 filas en `academies`/`academy_members`/
-- `academy_convocatoria`. Primer guion de la fase P11 (docs/PLAN-PRODUCTO.md):
-- servir la plataforma a varias academias (/alphapol, /depol, /corporepol…),
-- cada una con su banco privado de preguntas, sus alumnos y su
-- administración, y compartiendo el banco global (lo sigues generando tú) y
-- el temario (que es tuyo, no de las academias).
--
-- Contrastado contra `supabase/schema.json` del 7 sep 2026. Es idempotente:
-- volver a ejecutarlo no duplica nada. Después: `node scripts/schema-snapshot.mjs`.
--
-- QUÉ CREA
--   · `academies`       — una fila por academia: slug (la URL), nombre.
--   · `academy_members` — quién pertenece a qué academia. Muchos-a-muchos:
--     un alumno puede estar en más de una, aunque sea raro (decidido).
--   · `organization_id` en las tablas que hoy asumen una sola academia:
--     `question_bank` (NULABLE — NULL es el banco global), `class_groups`,
--     `group_kinds`, `academy_staff`, `admin_audit_log` (nulable: NULL es una
--     acción de plataforma, no de una academia concreta), `memberships`,
--     `monthly_payments`.
--   · `academy_settings`, `membership_settings` y `academy_convocatoria` DEJAN
--     de ser una fila única (`id = 1`, con CHECK) y pasan a una fila POR
--     ACADEMIA, con `organization_id` como clave. Se retira la columna `id`:
--     nunca fue más que el marcador del singleton.
--
-- QUÉ NO TOCA, A PROPÓSITO
--   · El temario (`subjects`, `blocks`, `documents`, `document_chunks`) sigue
--     siendo una tabla única y compartida. Decidido: «el temario solo me sirve
--     a mí para generar las preguntas» — separarlo por academia sería trabajo
--     sin beneficio.
--   · `ai_usage` NO lleva `organization_id`. La rentabilidad por academia
--     (panel de superadmin) se calcula uniendo por `user_id` contra
--     `academy_members` al leer, no guardando la academia en cada llamada:
--     evita la ambigüedad de a qué academia atribuir la llamada de un alumno
--     que estuviera en dos.
--   · Las tablas que ya filtran por `user_id` con la sesión del alumno
--     (`question_notes`, `profiles_physical`, `profiles_biodata`,
--     `profiles_psych`, `flashcard_progress`, `flashcard_results`,
--     `question_votes`, `training_plans`, `workout_logs`, `chat_conversations`,
--     `chat_messages`, `interview_reports`, `ai_quota`) no necesitan
--     `organization_id`: un alumno pertenece a su academia vía
--     `academy_members`, no hace falta duplicarlo en cada tabla suya.
--   · `question_reports` tampoco lleva `organization_id`: se resuelve por
--     join contra `question_bank.organization_id` de la pregunta reportada —
--     null (global) llega siempre al superadmin, el resto al admin de esa
--     academia. Es lógica de lectura (`app/lib/`), no una columna.
--   · `class_group_staff`, `class_members`, `group_training_plans` no llevan
--     `organization_id`: se resuelven por join contra `class_groups`, que sí
--     lo lleva.
--   · `profiles.role` NO lleva un CHECK de base de datos — nunca lo tuvo, es
--     texto libre leído con `=== 'admin'` y el resto cae a 'student'
--     (`app/lib/auth.ts`). Añadir `'superadmin'` como tercer valor no necesita
--     ALTER TABLE; ESE cambio de código espera a que este guion se ejecute,
--     porque sin `academy_members` un superadmin no tiene con qué
--     distinguirse de un admin normal de una sola academia.
--
-- LO QUE ESTE GUION NO PUEDE HACER POR SÍ SOLO
-- Las tablas administrativas (`class_groups`, `academy_staff`,
-- `monthly_payments`…) siguen con CERO políticas de RLS (regla 34): las lee y
-- las escribe la clave de servicio, detrás de `requireAdmin`. Que un admin de
-- una academia no vea ni toque los datos de otra depende de que el CÓDIGO
-- añada el filtro `organization_id` en cada consulta — este guion prepara la
-- columna, no sustituye esa disciplina. Es la misma razón por la que existe la
-- regla 34: con la clave de servicio, RLS no protege nada.
--
-- LA ACADEMIA QUE YA EXISTE
-- Se crea con slug provisional `principal` (cámbialo con un UPDATE, o desde el
-- panel de superadmin cuando exista — P11i) y se backfillean con su id todas
-- las filas existentes de las tablas de arriba. El banco de preguntas actual
-- se queda con `organization_id = NULL`: pasa a ser el banco global sin tocar
-- nada más, que es justo lo que hace falta para poder arrancar cualquier
-- academia nueva desde el primer día.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · Las academias
-- -----------------------------------------------------------------------------
create table if not exists public.academies (
  id         uuid        primary key default gen_random_uuid(),
  slug       text        not null unique,
  name       text        not null,
  created_at timestamptz not null default now()
);

alter table public.academies enable row level security;
-- Cero políticas: el slug de la URL se resuelve siempre en el SERVIDOR (login,
-- rutas) con la clave de servicio. No hace falta que un anónimo pueda leer
-- esta tabla con su propia sesión —ni la tiene todavía.


-- -----------------------------------------------------------------------------
-- PASO 2 · Quién pertenece a qué academia
-- -----------------------------------------------------------------------------
create table if not exists public.academy_members (
  academy_id uuid        not null references public.academies(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)       on delete cascade,
  created_at timestamptz not null default now(),
  primary key (academy_id, user_id)
);

create index if not exists academy_members_user_idx on public.academy_members (user_id);

alter table public.academy_members enable row level security;

-- Único caso con política de propietario en todo este guion: un alumno
-- necesita poder leer SUS PROPIAS academias (el selector del login si está en
-- más de una, y «Mi perfil»). Sin esto, la política de `academy_convocatoria`
-- del paso 8 no podría comprobar la academia del usuario: una subconsulta
-- contra una tabla con RLS y cero políticas devuelve vacío también para su
-- propio dueño.
drop policy if exists "academy_members propio" on public.academy_members;
create policy "academy_members propio"
  on public.academy_members
  for select
  to authenticated
  using (user_id = auth.uid());
-- Escritura (dar de alta a un alumno en una academia): solo la clave de
-- servicio, detrás de `requireAdmin` / el futuro `requireSuperadmin`.


-- -----------------------------------------------------------------------------
-- PASO 3 · `organization_id`, nulable de momento, en todo lo que va a llevarlo
-- -----------------------------------------------------------------------------
alter table public.question_bank        add column if not exists organization_id uuid references public.academies(id) on delete cascade;
alter table public.class_groups         add column if not exists organization_id uuid references public.academies(id) on delete cascade;
alter table public.group_kinds          add column if not exists organization_id uuid references public.academies(id) on delete cascade;
alter table public.academy_staff        add column if not exists organization_id uuid references public.academies(id) on delete cascade;
alter table public.admin_audit_log      add column if not exists organization_id uuid references public.academies(id) on delete cascade;
alter table public.memberships          add column if not exists organization_id uuid references public.academies(id) on delete cascade;
alter table public.monthly_payments     add column if not exists organization_id uuid references public.academies(id) on delete cascade;
alter table public.academy_settings     add column if not exists organization_id uuid references public.academies(id) on delete cascade;
alter table public.membership_settings  add column if not exists organization_id uuid references public.academies(id) on delete cascade;
alter table public.academy_convocatoria add column if not exists organization_id uuid references public.academies(id) on delete cascade;

create index if not exists question_bank_org_idx   on public.question_bank   (organization_id);
create index if not exists class_groups_org_idx    on public.class_groups    (organization_id);
create index if not exists admin_audit_log_org_idx on public.admin_audit_log (organization_id);


-- -----------------------------------------------------------------------------
-- PASO 4 · La academia que ya existe, y el backfill
-- -----------------------------------------------------------------------------
-- `question_bank` NO se toca aquí a propósito: se queda en NULL y pasa a ser
-- el banco global sin más.
do $$
declare
  v_academy_id uuid;
begin
  insert into public.academies (slug, name)
  values (
    'principal',
    coalesce((select name from public.academy_settings where id = 1), 'Academia')
  )
  on conflict (slug) do nothing;

  select id into v_academy_id from public.academies where slug = 'principal';

  -- Todo el que ya tiene perfil (admin incluido) entra en la academia
  -- principal. `on conflict do nothing`: repetir el guion no duplica.
  insert into public.academy_members (academy_id, user_id)
  select v_academy_id, id from public.profiles
  on conflict do nothing;

  update public.class_groups         set organization_id = v_academy_id where organization_id is null;
  update public.group_kinds          set organization_id = v_academy_id where organization_id is null;
  update public.academy_staff        set organization_id = v_academy_id where organization_id is null;
  update public.admin_audit_log      set organization_id = v_academy_id where organization_id is null;
  update public.memberships          set organization_id = v_academy_id where organization_id is null;
  update public.monthly_payments     set organization_id = v_academy_id where organization_id is null;
  update public.academy_settings     set organization_id = v_academy_id where id = 1 and organization_id is null;
  update public.membership_settings  set organization_id = v_academy_id where id = 1 and organization_id is null;
  update public.academy_convocatoria set organization_id = v_academy_id where id = 1 and organization_id is null;
end $$;


-- -----------------------------------------------------------------------------
-- PASO 5 · Ya hay dato en todas: exigir NOT NULL donde corresponde
-- -----------------------------------------------------------------------------
-- `question_bank.organization_id` y `admin_audit_log.organization_id` se
-- quedan NULABLES a propósito (global / acción de plataforma). El resto no:
-- una fila sin academia ahí sería un dato huérfano.
alter table public.class_groups        alter column organization_id set not null;
alter table public.group_kinds         alter column organization_id set not null;
alter table public.academy_staff       alter column organization_id set not null;
alter table public.memberships         alter column organization_id set not null;
alter table public.monthly_payments    alter column organization_id set not null;
alter table public.academy_settings    alter column organization_id set not null;
alter table public.membership_settings alter column organization_id set not null;
alter table public.academy_convocatoria alter column organization_id set not null;


-- -----------------------------------------------------------------------------
-- PASO 6 · `group_kinds`: el slug del tipo se reutiliza entre academias
-- -----------------------------------------------------------------------------
-- Antes la clave era `id` (el slug, 'fisicas') a secas. Con varias academias,
-- dos academias distintas pueden llamar 'fisicas' a su propio tipo sin que
-- choquen entre sí.
alter table public.group_kinds drop constraint if exists group_kinds_pkey;
alter table public.group_kinds add primary key (organization_id, id);


-- -----------------------------------------------------------------------------
-- PASO 7 · `memberships` y `monthly_payments`: la clave gana la academia
-- -----------------------------------------------------------------------------
-- Un alumno en dos academias puede tener acceso y pagos distintos en cada
-- una: la clave deja de ser solo `user_id` / `(user_id, period)`.
alter table public.memberships drop constraint if exists memberships_pkey;
alter table public.memberships add primary key (organization_id, user_id);

alter table public.monthly_payments drop constraint if exists monthly_payments_pkey;
alter table public.monthly_payments add primary key (organization_id, user_id, period);


-- -----------------------------------------------------------------------------
-- PASO 8 · Los tres singleton (`id = 1`) pasan a una fila por academia
-- -----------------------------------------------------------------------------
alter table public.academy_settings drop constraint if exists academy_settings_singleton;
alter table public.academy_settings drop constraint if exists academy_settings_pkey;
alter table public.academy_settings drop column if exists id;
alter table public.academy_settings add primary key (organization_id);

alter table public.membership_settings drop constraint if exists membership_settings_singleton;
alter table public.membership_settings drop constraint if exists membership_settings_pkey;
alter table public.membership_settings drop column if exists id;
alter table public.membership_settings add primary key (organization_id);

alter table public.academy_convocatoria drop constraint if exists academy_convocatoria_singleton;
alter table public.academy_convocatoria drop constraint if exists academy_convocatoria_pkey;
alter table public.academy_convocatoria drop column if exists id;
alter table public.academy_convocatoria add primary key (organization_id);

-- `academy_convocatoria` es la única de las tres que un ALUMNO lee con su
-- propia sesión (la cuenta atrás en «Mi perfil», regla 64). La política
-- vieja era `using (true)` porque solo había una academia; ahora tiene que
-- comprobar que el alumno pertenece A ESA academia, o vería la cuenta atrás
-- de cualquier otra.
drop policy if exists "convocatoria lectura" on public.academy_convocatoria;
create policy "convocatoria lectura"
  on public.academy_convocatoria
  for select
  to authenticated
  using (
    organization_id in (
      select academy_id from public.academy_members where user_id = auth.uid()
    )
  );
-- Escritura: solo la clave de servicio, detrás de `requireAdmin` (sin cambios).


-- -----------------------------------------------------------------------------
-- PASO 9 · Comprobación
-- -----------------------------------------------------------------------------
--   select slug, name from public.academies;
--   -- una fila: 'principal'
--
--   select count(*) from public.academy_members;
--   -- tantas como perfiles había antes de ejecutar el guion
--
--   select relname, relrowsecurity from pg_class
--   where relname in ('academies', 'academy_members');
--   -- las dos con relrowsecurity = true
--
--   select column_name from information_schema.columns
--   where table_name = 'academy_settings' and column_name = 'id';
--   -- vacío: la columna ya no existe
--
--   select organization_id, count(*) from public.question_bank
--   group by organization_id;
--   -- todo en NULL: el banco actual es ahora el banco global
