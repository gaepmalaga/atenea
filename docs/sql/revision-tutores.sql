-- LA ÚLTIMA PALABRA ES DE LOS TUTORES (regla 138, 20 nov 2026).
--
-- Por qué: el dueño fijó que cada pregunta pasa por una revisión manual y que
-- los tutores (hoy, todas las cuentas admin) aprueban CADA cambio y se enteran
-- de todo. Hasta hoy no había forma de saber si una pregunta activa la había
-- leído una persona (4.617 las escribió la IA a partir del temario y se
-- activaron en bloque), y varios procesos cambiaban preguntas sin preguntar:
-- el clasificador y la medición de dificultad, y las correcciones hechas por
-- Claude con SQL.
--
-- 1. `question_bank.reviewed_*`: quién revisó la pregunta y cuándo. Se pone al
--    publicarla, al editarla o al marcarla «Revisada» desde el revisor.
-- 2. `question_proposals`: un cambio propuesto (por Claude, por la IA o por un
--    proceso) con su foto de antes y de después. No toca la pregunta hasta que
--    un tutor lo aprueba; si lo rechaza, queda anotado.
-- 3. `novedades`: lo que ha pasado (el vigilante encontró cambios en la ley,
--    entraron preguntas nuevas, se propusieron cambios) para la bandeja
--    «Revisión». Las decisiones de cada tutor ya van a `admin_audit_log`.
-- 4. `academy_settings.solo_preguntas_revisadas`: si está activo, los alumnos
--    solo reciben preguntas revisadas por un tutor.
--
-- Las dos tablas nuevas, sin políticas: solo las toca el servidor con la clave
-- de servicio, acotando por academia en cada consulta (reglas 34 y 75).

alter table public.question_bank
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_by_email text;

create index if not exists question_bank_sin_revisar
  on public.question_bank (status, subject_id)
  where reviewed_at is null;

create table if not exists public.question_proposals (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_bank(id) on delete cascade,
  organization_id uuid,
  source text not null check (source in ('claude', 'ia', 'dificultad', 'sistema')),
  reason text not null check (length(btrim(reason)) > 0),
  before jsonb not null,
  after jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'superseded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_email text,
  decision_note text
);

-- Una sola propuesta pendiente por pregunta: dos a la vez se pisarían.
create unique index if not exists question_proposals_una_pendiente
  on public.question_proposals (question_id)
  where status = 'pending';
create index if not exists question_proposals_estado
  on public.question_proposals (status, created_at);

alter table public.question_proposals enable row level security;

create table if not exists public.novedades (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  created_at timestamptz not null default now(),
  tipo text not null,
  titulo text not null check (length(btrim(titulo)) > 0),
  detalle text,
  autor text
);
create index if not exists novedades_recientes on public.novedades (created_at desc);

alter table public.novedades enable row level security;

alter table public.academy_settings
  add column if not exists solo_preguntas_revisadas boolean not null default false;
