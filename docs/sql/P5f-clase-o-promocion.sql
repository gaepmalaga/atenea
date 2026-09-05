-- =============================================================================
-- P5f — Agrupar alumnos por clase o promoción
-- =============================================================================
--
-- ✅ EJECUTADO el 5 sep 2026: `profiles.class_group` y su índice existen en el
--    Supabase real, y el código ya lo usa (regla 35: filtro y edición en el
--    panel de Academia). P5f cerrada.
--
-- POR QUE
-- El panel de academia (P5) ya dice a quién llamar, en qué falla cada alumno y
-- qué temas no toca nadie. Lo que le falta para dar clase de verdad es agrupar:
-- «la promoción de 2026», «el grupo de tarde», «los de la beca». Hoy la lista
-- es plana y el profesor no puede mirar solo a su clase.
--
-- QUE HACE
-- Añade UNA columna de texto libre a `profiles`: `class_group`. El admin la
-- escribe en la ficha del alumno; la lista de academia se puede filtrar y
-- agrupar por ese valor.
--
-- POR QUE TEXTO LIBRE Y NO UNA TABLA `academy_classes`
-- Con una sola academia, «la promoción de 2026» es una etiqueta, no una entidad
-- con horario y profesor propios. Una tabla aparte + FK obligaría a gestionar
-- altas y bajas de clases para algo que hoy es escribir dos palabras. El día que
-- una clase necesite datos propios (su horario, su profesor de `academy_staff`),
-- esto migra a una tabla y `class_group` pasa a ser el nombre por defecto — sin
-- perder lo ya escrito. Misma decisión que `academy_settings.schedule` (regla 50):
-- texto libre mientras no haya que calcular nada con él.
--
-- POR QUE `null` Y NO `''`
-- `null` = «sin asignar todavía», que es un estado legítimo y el de casi todos
-- al principio. La cadena vacía sería un segundo «sin asignar» que la UI tendría
-- que tratar igual que `null` en todos los sitios (regla 8 y 16). El código
-- normaliza `''` a `null` antes de escribir.
--
-- SIN RLS NUEVA
-- `profiles` ya tiene sus políticas. Esta columna la lee y la escribe el panel
-- de academia con la clave de servicio, detrás de `requireAdmin` (regla 35): es
-- el profesor mirando y organizando a SUS alumnos, no cubierto por ninguna
-- política de propietario. Un alumno no ve ni cambia su propia clase.
--
-- COMO EJECUTARLO
-- Supabase -> SQL Editor -> pegar -> Run. Es idempotente: se puede repetir.
-- Después: `node scripts/schema-snapshot.mjs` para que `schema-drift` sepa que
-- la columna existe, y entonces se conecta el código (acción + agrupación en
-- `app/lib/academy.ts` + UI en `AdminAcademy`).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · La columna
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS class_group text;

COMMENT ON COLUMN public.profiles.class_group IS
  'Clase o promoción del alumno (texto libre): "Promoción 2026", "Grupo tarde". '
  'null = sin asignar. La gestiona el panel de academia (requireAdmin).';


-- -----------------------------------------------------------------------------
-- PASO 2 · Un índice para el filtro
-- -----------------------------------------------------------------------------
-- La lista de academia filtra por clase (`.eq('class_group', ...)`). Con pocos
-- alumnos da igual, pero el índice cuesta nada y evita el escaneo completo el
-- día que la academia tenga cientos. Parcial: las filas sin asignar no ocupan.
CREATE INDEX IF NOT EXISTS profiles_class_group_idx
  ON public.profiles (class_group)
  WHERE class_group IS NOT NULL;


-- -----------------------------------------------------------------------------
-- PASO 3 · Comprobación
-- -----------------------------------------------------------------------------
-- La columna existe y es nullable:
--
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'profiles'
--     AND column_name = 'class_group';
--
-- (Debe devolver: class_group | text | YES)
