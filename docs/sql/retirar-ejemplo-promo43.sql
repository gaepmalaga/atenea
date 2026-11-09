-- =============================================================================
-- RETIRAR EL EJEMPLO «PROMO 43 · FÍSICAS» (regla 97) — SIN EJECUTAR
-- =============================================================================
--
-- NO SE HA EJECUTADO. Borra datos: hace falta el visto bueno del dueño.
-- PROPUESTA: ejecutarlo cuando los entrenos individuales estén en marcha con
-- alumnos de verdad. Hasta entonces no estorba: desde la regla 97 un grupo sin
-- horario no sale en el cuadrante, y sus sesiones solo las ve el alumno de
-- prueba, como «plan común».
--
-- Lo que se creó el 6 nov a petición del dueño para enseñar un mes entero
-- (regla 86), comprobado el 9 nov:
--   - el grupo «Promo 43 · Físicas» (65f71522-06fb-4dfd-8294-ab0b20d13438),
--     sin horario, con prueba.alumno@alphapol.es dentro;
--   - sus 29 sesiones, 5 apuntes del alumno de prueba y 5 notas de semana
--     (se van con el grupo: las claves ajenas son `on delete cascade`);
--   - 2 sesiones individuales de ejemplo del alumno de prueba
--     («Extra: dominadas negativas»).
--   Son las 31 sesiones de ejemplo.
--
-- Lo que NO se toca: las 5 plantillas (sirven), las marcas y el 1RM, el grupo
-- de teoría «Promo 43» y los grupos de la Promoción 44.
-- =============================================================================

begin;

-- Se para si el grupo ya no es el de ejemplo (tiene horario, o alumnos de verdad).
do $$
declare
  g record;
  ajenos int;
begin
  select * into g from public.class_groups where id = '65f71522-06fb-4dfd-8294-ab0b20d13438';
  if not found then raise exception 'El grupo de ejemplo ya no existe: nada que hacer.'; end if;
  if g.weekdays is not null and array_length(g.weekdays, 1) > 0 then
    raise exception 'El grupo tiene horario: ya no es el de ejemplo. No se borra.';
  end if;
  select count(*) into ajenos from public.class_members m join public.profiles p on p.id = m.user_id
   where m.class_id = g.id and p.email <> 'prueba.alumno@alphapol.es';
  if ajenos > 0 then raise exception 'El grupo tiene alumnos de verdad (%). No se borra.', ajenos; end if;
end $$;

delete from public.training_sessions
 where user_id = (select id from public.profiles where email = 'prueba.alumno@alphapol.es')
   and title = 'Extra: dominadas negativas'
   and created_at < '2026-11-07';

delete from public.class_groups where id = '65f71522-06fb-4dfd-8294-ab0b20d13438';

commit;

-- COMPROBACIÓN
--   select count(*) from training_sessions;   -- 32 - 31 = 1 (la «Jdjd» de Kappa que puso el dueño probando, si sigue)
