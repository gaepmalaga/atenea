-- =============================================================================
-- Familias de preguntas: la misma pregunta con otras palabras (regla 119)
-- =============================================================================
--
-- POR QUÉ
-- El banco se generó con el modelo a partir de los mismos artículos y tiene
-- muchas preguntas que son LA MISMA: el mismo hecho aparece hasta 26 veces
-- («tráfico ilícito de migrantes frente a trata», «seguridad privada,
-- actividad complementaria y subordinada»…). De las 4.617 activas, 1.562 (el
-- 34 %) son repeticiones de otra: hay unos 3.050 hechos distintos. Un examen
-- que lleva el mismo hecho tres veces regala puntos a quien lo sabe, castiga
-- tres veces a quien no, y deja menos sitio para los demás temas.
--
-- QUÉ AÑADE
-- `family_id`: el mismo valor en todas las preguntas que son la misma (se
-- calcula con `npm run familias`, `app/lib/familias.ts`: similitud de texto,
-- sin IA). NULL = la pregunta no tiene repetidas. NO se borra ni se desactiva
-- ninguna pregunta: el generador de exámenes simplemente no mete dos de la
-- misma familia mientras haya otras para elegir.
--
-- Idempotente.
-- =============================================================================

alter table public.question_bank add column if not exists family_id uuid;

create index if not exists question_bank_family_idx
  on public.question_bank (family_id) where family_id is not null;
