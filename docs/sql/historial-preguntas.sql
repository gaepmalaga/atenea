-- =============================================================================
-- Historial de cambios de las preguntas del banco (regla 135)
-- =============================================================================
--
-- POR QUÉ
-- «Exámenes en papel» deja corregir una pregunta justo antes de imprimir, y esa
-- corrección SOBRESCRIBE la del banco (la ven todos los alumnos). Para que un
-- cambio hecho con prisa no sea para siempre, cada edición guarda cómo estaba
-- la pregunta ANTES y cómo queda DESPUÉS: se puede ver quién la tocó, cuándo y
-- desde dónde, y volver a la versión anterior.
--
-- UNA fila = una edición. `before`/`after` son instantáneas de los campos que
-- se editan (enunciado, opciones, correcta, explicación, dificultad).
-- RLS activada y CERO políticas: solo la clave de servicio (regla 34), y cada
-- acción acota por el alcance de quien edita. Seguro de repetir.
-- =============================================================================

create table if not exists public.question_edit_history (
  id              uuid primary key default gen_random_uuid(),
  question_id     uuid not null references public.question_bank(id),
  organization_id uuid,
  changed_by      uuid,
  changed_by_email text,
  changed_at      timestamptz not null default now(),
  source          text not null check (source in ('banco', 'examen_papel', 'restaurar')),
  before          jsonb not null,
  after           jsonb not null
);

create index if not exists question_edit_history_pregunta
  on public.question_edit_history (question_id, changed_at desc);

alter table public.question_edit_history enable row level security;
