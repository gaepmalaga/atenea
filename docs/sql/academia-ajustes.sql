-- ============================================================================
-- LOS DATOS DE LA ACADEMIA
--
-- QUÉ RESUELVE
-- No había ni una tabla ni una pantalla con el nombre de la academia, su
-- dirección, sus horarios, un correo de contacto o quién da clase. Para un
-- panel de administración que ya sabe mucho de cómo estudia un alumno, no
-- saber nada de la academia que lo dirige es el agujero más básico de todos.
--
-- DOS TABLAS, Y LAS DOS ADMINISTRACIÓN PURA
--   · `academy_settings` — UNA FILA (id = 1, forzado por el check). Nombre,
--     dirección, horario en texto libre (no una tabla de franjas: una
--     academia con un horario raro no tiene por qué encajarlo en un modelo
--     rígido) y los datos de contacto.
--   · `academy_staff` — profesores, entrenadores, administración. `role` es
--     texto libre y no un enum: añadir un puesto nuevo no puede exigir una
--     migración.
--
-- CERO POLÍTICAS DE RLS, A PROPÓSITO (regla 34). Esto no es del alumno, es de
-- quien dirige la academia: se lee y se escribe con la clave de servicio,
-- detrás de `requireAdmin`. Con la sesión del alumno devolvería cero filas en
-- silencio, que es justo el modo de fallo que hay que evitar.
--
-- ES IDEMPOTENTE.
-- ============================================================================

create table if not exists public.academy_settings (
  id            integer      primary key default 1,
  name          text,
  address       text,
  -- Texto libre: "L-V 9:00-14:00 y 16:00-20:00, sábados 10:00-13:00" no
  -- encaja en un modelo de franjas sin perder matices, y aquí no hace falta
  -- calcular nada con el horario — solo enseñarlo.
  schedule      text,
  contact_email text,
  contact_phone text,
  updated_at    timestamptz  not null default now(),
  constraint academy_settings_singleton check (id = 1)
);

create table if not exists public.academy_staff (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  -- 'profesor', 'entrenador', 'administracion'... texto libre para que un
  -- puesto nuevo no pida una migración.
  role       text        not null default 'profesor',
  email      text,
  phone      text,
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

alter table public.academy_settings enable row level security;
alter table public.academy_staff    enable row level security;
