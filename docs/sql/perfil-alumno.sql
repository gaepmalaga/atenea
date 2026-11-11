-- =============================================================================
-- El perfil del alumno: nombre, teléfono y foto (regla 114)
-- =============================================================================
--
-- POR QUÉ
-- `profiles` solo guardaba id, correo y rol. El nombre que ve la academia en
-- «Alumnos» o en «Pagos» se DEDUCÍA del correo (`ana.ruiz@…` → «Ana Ruiz»), y
-- no había teléfono: para llamar a un alumno que lleva dos semanas sin entrar
-- había que buscarlo fuera. El informe semanal y los exámenes en PDF necesitan
-- un nombre de verdad.
--
-- QUÉ AÑADE
--   · Tres columnas en `profiles`, las tres opcionales (regla 16: vacío es
--     NULL, no cadena vacía).
--   · Un cubo público `avatars` para las fotos. Solo escribe el servidor con
--     la clave de servicio (`saveMiFoto`), así que no lleva políticas de
--     escritura: sin política, ni `anon` ni `authenticated` pueden subir nada.
--     Es público para LEER porque la foto se pinta con un `<img>`; el nombre
--     del fichero es el id del alumno, que no se puede adivinar.
--
-- `profiles` sigue con RLS y su única política (leer el propio): el alumno NO
-- escribe la tabla; lo hace `saveMiPerfil` tras validar (regla 2).
--
-- Idempotente.
-- =============================================================================

alter table public.profiles
  add column if not exists full_name  text,
  add column if not exists phone      text,
  add column if not exists avatar_url text;

alter table public.profiles drop constraint if exists profiles_full_name_largo;
alter table public.profiles add constraint profiles_full_name_largo
  check (full_name is null or char_length(full_name) between 2 and 80);

alter table public.profiles drop constraint if exists profiles_phone_largo;
alter table public.profiles add constraint profiles_phone_largo
  check (phone is null or char_length(phone) between 9 and 20);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 307200, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
