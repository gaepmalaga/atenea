-- =============================================================================
-- RETIRAR EL PLAN DE SEMANA VIEJO (reglas 84, 86 y 97) — SIN EJECUTAR
-- =============================================================================
--
-- NO SE HA EJECUTADO. Borra dos tablas: hace falta el visto bueno del dueño.
--
-- Desde la regla 86 (6 nov 2026) la física son SESIONES sueltas
-- (`training_sessions`), y desde la regla 97 las clases de grupo van en el
-- cuadrante y el entreno es de cada alumno. El modelo de antes —un plan por
-- semana y grupo, y un registro por grupo y fecha— se quedó sin pantallas:
--
--   - `group_training_plans`: 0 filas (comprobado el 9 nov 2026).
--   - `group_workout_logs`:   0 filas (comprobado el 9 nov 2026).
--
-- Ya se retiró del código (regla 97): `getGroupTrainingPlan`,
-- `saveGroupTrainingPlan` y `deleteGroupTrainingPlan` (`app/actions/groups.ts`)
-- y la lectura de `getGroups` que decía «con plan / sin plan».
--
-- ANTES DE EJECUTARLO, en el código:
--   1. `app/actions/training.ts`: quitar las dos lecturas de
--      `group_training_plans` — la herencia del plan de grupo en
--      `getActiveTrainingPlan` y `getStudentGroupWeeks` entera (y su uso en
--      `PhysicalTrainer.tsx`). Con la tabla vacía no cambia nada para nadie,
--      pero sin la tabla esas consultas darían error.
--   2. Sus tests: los de herencia del plan de grupo en `tests/groups.test.ts`
--      y `tests/modules.test.ts`.
--   3. `app/lib/limpieza.ts`: quitar las dos tablas de sus listas.
--   4. Añadirlas a `RETIRADAS` en `tests/schema-drift.test.ts` y sacarlas de
--      `supabase/schema.json`.
--
-- Después de ejecutarlo:  select to_regclass('public.group_training_plans'),
--                                to_regclass('public.group_workout_logs');   -- null, null
-- =============================================================================

begin;

-- Se para si alguna tiene filas: entonces ya no es «vacía» y hay que mirarlo.
do $$
begin
  if (select count(*) from public.group_training_plans) > 0
     or (select count(*) from public.group_workout_logs) > 0 then
    raise exception 'Alguna de las dos tablas tiene filas: no se borra nada.';
  end if;
end $$;

drop table if exists public.group_workout_logs;
drop table if exists public.group_training_plans;

commit;
