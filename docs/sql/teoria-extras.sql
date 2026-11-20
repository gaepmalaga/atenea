-- SEGUNDO PROFESOR, FORMACIONES EXTRAS Y EL HORARIO REAL DE LA TEORÍA
-- (regla 142, 20 nov 2026).
--
-- Por qué: Alphapol manda cada semana una imagen con el cuadrante de teoría.
-- Para generarla desde la plataforma faltaban tres cosas:
--
-- 1. A veces una clase la dan DOS profesores («Morato y Enrique»). Lo normal es
--    uno, pero la plataforma se prepara para dos: `theory_sessions.teacher2_id`.
--    Cada uno suma 1 clase dada (dueño, 20 nov).
-- 2. Además de las clases fijas de los grupos, hay formaciones EXTRAS (el Curso
--    OSINT y otras), para los mismos alumnos o para gente externa. Tabla
--    `extra_events`: fecha, hora (opcional), título, profesor(es), para quién es
--    y una nota. Sin lista de asistentes por ahora.
-- 3. Los tres grupos de teoría tenían un horario «provisional» (10:00-14:00 y
--    16:00-20:00). El real, el de la imagen: 10:00-13:00 y 16:30-19:30.
--
-- RLS activada y CERO políticas: solo la clave de servicio (regla 34) y cada
-- acción acota por organization_id. Seguro de repetir.

alter table public.theory_sessions
  add column if not exists teacher2_id uuid references public.academy_staff(id) on delete set null;

create table if not exists public.extra_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_date      date not null,
  start_time      time,
  end_time        time,
  title           text not null check (char_length(btrim(title)) between 2 and 120),
  teacher_id      uuid references public.academy_staff(id) on delete set null,
  teacher2_id     uuid references public.academy_staff(id) on delete set null,
  audience        text not null default 'alumnos' check (audience in ('alumnos', 'externos', 'ambos')),
  note            text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists extra_events_org_fecha on public.extra_events (organization_id, event_date);
alter table public.extra_events enable row level security;

-- El horario real de los tres grupos de teoría (era «provisional»).
update public.class_groups set start_time = '10:00', end_time = '13:00',
  schedule = 'Lunes y miércoles por la mañana · 10:00 a 13:00'
 where kind = 'teoria' and name = 'L-X MAÑANAS';
update public.class_groups set start_time = '10:00', end_time = '13:00',
  schedule = 'Martes y jueves por la mañana · 10:00 a 13:00'
 where kind = 'teoria' and name = 'M-J MAÑANAS';
update public.class_groups set start_time = '16:30', end_time = '19:30',
  schedule = 'Martes y jueves por la tarde · 16:30 a 19:30'
 where kind = 'teoria' and name = 'M-J TARDE';
