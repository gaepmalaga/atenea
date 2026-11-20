-- DE DÓNDE VIENE CADA PREGUNTA (regla 139, 20 nov 2026).
--
-- Por qué: el dueño distingue dos bloques con trabajo de revisión distinto.
--   · «academia»: las preguntas que envió la propia academia (la batería de
--     los temas 1-4, 725 activas). El enunciado y la respuesta son suyos; lo
--     que añadimos nosotros es la retroalimentación (explicación y referencia).
--     El tutor revisa la explicación.
--   · «ia»: las que escribió una IA (las 4.617 del banco global, que
--     sembró Gemini a partir del temario, y las 985 pendientes que redactó
--     Claude desde el Tomo I). El tutor las revisa enteras.
--
-- Hasta hoy solo había `origin`, que no lo distingue (las 725 y las 985 son
-- `manual`), así que el revisor no podía decir qué mirar de cada una.
--
-- Una columna aparte y no un valor nuevo de `origin`: `origin` lo lee el
-- test del alumno (regla 39) y cambiarle el significado a mitad de camino
-- rompería lo que ya funciona.
--
-- Por defecto «ia»: lo que se genera sin decirlo es de una IA. Lo que escribe
-- un tutor a mano o sube de un examen en papel lo dice el código («academia»).
-- Relleno único de lo que hay: `manual` y activa es de la academia (las 985
-- pendientes siguen siendo «ia»: aún están pendientes).

alter table public.question_bank
  add column if not exists fuente text not null default 'ia'
  check (fuente in ('academia', 'ia'));

update public.question_bank
   set fuente = 'academia'
 where origin = 'manual' and status = 'active' and fuente = 'ia';

create index if not exists question_bank_fuente_idx
  on public.question_bank (fuente, status);
