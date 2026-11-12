-- DE DÓNDE SALE LA DIFICULTAD DE UNA PREGUNTA (docs/DIFICULTAD.md, tres capas).
--
-- `difficulty_level` vale 2 en las 4.617 preguntas porque se sembró con el
-- valor por defecto. Para llenarlo con una estimación sin pisar lo que luego
-- ponga el preparador a mano, ni lo que salga de la medida real, hace falta
-- saber de QUIÉN es cada valor:
--
--   NULL        sin origen: es el 2 por defecto de la siembra, nadie lo ha decidido
--   'estimada'  la clasificó el modelo con la rúbrica (`clasificar-dificultad.mjs`)
--   'preparador' la puso una persona de la academia
--   'medida'    sale del acierto observado con 30 o más respuestas reales
--
-- Una reclasificación solo toca NULL y 'estimada': lo del preparador y lo
-- medido manda sobre la estimación.
--
-- Solo se AÑADE una columna: nada se reescribe ni se pierde. RLS no cambia:
-- `question_bank` ya la tiene y esta columna no abre nada nuevo.
alter table public.question_bank
  add column if not exists difficulty_source text
  check (difficulty_source in ('estimada', 'preparador', 'medida'));

comment on column public.question_bank.difficulty_source is
  'De quién es difficulty_level: NULL = el 2 por defecto de la siembra; estimada = el modelo; preparador = una persona; medida = acierto real con 30+ respuestas.';
