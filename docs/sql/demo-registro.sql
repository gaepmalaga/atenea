-- ============================================================
-- DATOS DE DEMOSTRACIÓN: EL REGISTRO DE LO QUE CREÓ LA CARGA (regla 106)
-- ============================================================
--
-- POR QUÉ HACE FALTA
-- El botón «Cargar datos de demostración» (Ajustes) mete en la academia
-- alumnos, grupos, sesiones, respuestas, cobros… INVENTADOS, en una base de
-- datos de producción y sin copias de seguridad. La única forma de poder
-- quitarlos después SIN llevarse nada real es que la carga apunte, FILA A
-- FILA, lo que crea: su tabla y su clave primaria. «Borrar los datos de
-- demostración» quita exactamente eso (y lo que cuelga de ello), y nada más.
--
-- CÓMO SE USA
--   · La carga apunta cada fila ANTES de crearla. Si se corta a medias, el
--     borrado sabe qué limpiar (borrar una clave que no llegó a crearse no
--     hace nada).
--   · Si la fila que iba a crear ya existe (una sesión de ese grupo ese día,
--     una semana ya publicada…), NO se crea ni se apunta: no es de la demo.
--   · `clave` es la clave primaria de la fila apuntada, como json:
--       {"id": "…"}                         (clave simple)
--       {"class_id": "…", "session_date": "2026-11-09"}   (compuesta)
--   · `datos` guarda lo que haga falta para deshacer bien. Hoy, una sola cosa:
--     la fila de `receipt_counters` (el contador de recibos) apunta si YA
--     existía antes de la carga: {"existia": false, "last_no_antes": 0}.
--   · Las filas con `tabla` que empieza por «_» no son filas de ninguna tabla,
--     son marcas de la propia carga: «_carga» (qué mes y qué momento: todas
--     las fases usan el mismo «ahora») y «_fase» (qué fases han terminado).
--   · Al terminar el borrado no queda NADA en esta tabla.
--
-- SEGURIDAD
-- RLS activado y CERO políticas, como `class_absences` (regla 82): solo la
-- clave de servicio la toca, detrás de `requireAdmin()` y acotada a la academia
-- de la sesión. Un alumno no puede ni leerla.
--
-- Solo AÑADE una tabla nueva. No toca ninguna otra.

create table if not exists public.demo_registro (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.academies(id) on delete cascade,
  -- El mes de la carga, `YYYY-MM` en la hora de la academia.
  periodo text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- La fase de la carga que la creó: cuentas, grupos, fisica, respuestas, cobros.
  fase text not null,
  -- La tabla de la fila apuntada («auth.users» para las cuentas).
  tabla text not null check (char_length(tabla) between 1 and 80),
  -- Su clave primaria.
  clave jsonb not null,
  datos jsonb,
  creado_en timestamptz not null default now()
);

-- Una fila se apunta una sola vez: reintentar una fase no duplica el registro.
create unique index if not exists demo_registro_clave
  on public.demo_registro (organization_id, tabla, clave);

create index if not exists demo_registro_por_tabla
  on public.demo_registro (organization_id, tabla);

alter table public.demo_registro enable row level security;
-- Sin políticas, a propósito.
