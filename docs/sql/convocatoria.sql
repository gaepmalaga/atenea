-- ============================================================================
-- LA CONVOCATORIA — la fecha del examen y una cuenta atrás
--
-- QUÉ RESUELVE
-- Un opositor organiza meses de estudio alrededor de UNA fecha, y la plataforma
-- no la sabía. «Faltan 147 días» ordena el estudio y motiva más que cualquier
-- gráfica. La convocatoria de la Escala Básica del CNP es nacional: la misma
-- fecha para todos los alumnos de la academia, así que NO es un dato por
-- alumno — la pone el administrador una vez, en «Ajustes».
--
-- UNA TABLA, UNA FILA (id = 1, forzado por el check). Igual patrón que
-- `academy_settings`.
--
-- RLS: lectura para cualquier usuario autenticado (el alumno ve la cuenta atrás
-- en «Mi perfil»); la escritura va con la clave de servicio detrás de
-- `requireAdmin`, como el resto de la administración (regla 34/50). Aquí SÍ hace
-- falta una política de SELECT porque el alumno lo lee con su sesión.
--
-- ES IDEMPOTENTE.
-- ============================================================================

create table if not exists public.academy_convocatoria (
  id           integer     primary key default 1,
  -- 'Escala Básica' u otra escala. Texto libre: no merece un enum.
  escala       text,
  -- La fecha de la primera prueba. `null` = todavía sin convocar.
  fecha_examen date,
  -- Referencia del BOE u otra nota, opcional.
  nota         text,
  updated_at   timestamptz not null default now(),
  constraint academy_convocatoria_singleton check (id = 1)
);

insert into public.academy_convocatoria (id) values (1)
on conflict (id) do nothing;

alter table public.academy_convocatoria enable row level security;

-- El alumno la lee con SU sesión (cuenta atrás en «Mi perfil»).
drop policy if exists "convocatoria lectura" on public.academy_convocatoria;
create policy "convocatoria lectura"
  on public.academy_convocatoria
  for select
  to authenticated
  using (true);

-- Escritura: solo la clave de servicio (la acción ya exige requireAdmin). Sin
-- política de INSERT/UPDATE para la sesión: un alumno no toca esto.
