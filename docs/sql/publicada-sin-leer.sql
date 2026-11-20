-- PUBLICADA SIN LEER UNA A UNA (regla 139, 20 nov 2026).
--
-- Por qué: revisar 5.601 preguntas de IA una a una es inviable antes de que
-- entren los alumnos, y las que no tienen ningún aviso y llevan referencia legal
-- ya las comparó el repaso contra el BOE. El dueño decidió publicarlas y
-- esperar a las quejas de los alumnos.
--
-- Pero «revisada por un tutor» (`reviewed_at`) es una afirmación: que un tutor
-- la leyó. Publicarlas con esa marca sería mentir. Esta columna es otra cosa:
-- «publicada por decisión del dueño, sin lectura individual». La pregunta SIGUE
-- pendiente de revisar (`reviewed_at` vacío), y el tutor la ve como tal: «publicada
-- sin leer».
--
-- Lo que se sirve a los alumnos con «solo revisadas»: revisadas, de la academia
-- o publicadas sin leer (`FILTRO_SERVIBLE_REVISADO`).

alter table public.question_bank
  add column if not exists publicada_sin_leer_el timestamptz;

create index if not exists question_bank_sin_leer_idx
  on public.question_bank (publicada_sin_leer_el) where publicada_sin_leer_el is not null;
