-- =============================================================================
-- P12 — Solicitudes de alta con aviso por correo, y exentos de pago
-- =============================================================================
--
-- QUÉ RESUELVE
-- Decisión del dueño (12 sep 2026): la norma global pasa a ser que TODO alumno
-- que se registra —incluida la academia «casa», `atenea»— espera a que su
-- academia lo acepte. El admin recibe un correo cuando hay una solicitud
-- nueva, la acepta o la rechaza desde el panel, y el alumno recibe el
-- resultado por correo. Como excepción, cada admin puede dejar una lista de
-- correos que entran directos, sin solicitud ni pago (p. ej. familiares,
-- profesores, cuentas de prueba).
--
-- Este guion es solo el ESQUEMA. Los correos los manda la propia app (no
-- Supabase Auth — eso solo cubre confirmar cuenta / invitación / recuperar
-- clave), con nodemailer y la cuenta Gmail ya dada de alta. Ver
-- `app/lib/registration-requests.ts`, `app/lib/mailer.ts` y
-- `app/lib/app-email-templates.ts`.
--
-- TRES CAMBIOS
--   1. `memberships.access_status` admite un tercer valor, `pending`: antes
--      "pendiente" era la AUSENCIA de fila (regla 52); ahora TAMBIÉN puede ser
--      una fila real, porque hace falta poder decir "esto ya se le avisó al
--      admin" y no volver a mandarle el correo cada vez que el alumno entra.
--      Las dos formas siguen significando lo mismo para `decideAccess`.
--   2. `memberships.exempt` (boolean): el alumno no debe nada — la pestaña
--      Pagos lo enseña marcado "Exento" en vez de "pagó"/"debe" (P8, regla 53).
--   3. `membership_exemptions`: la lista blanca por academia. Un correo aquí
--      entra `active` + `exempt` directo, sin solicitud ni aviso a nadie.
--
-- EL DEFAULT DE `membership_settings.required` PASA A `true`
-- Antes (regla 52) una academia nacía ABIERTA — "sin fila = false" era la
-- decisión explícita para no romper nada al ejecutar el guion. Ahora la norma
-- es la contraria: una academia nueva nace CERRADA, todo alumno espera
-- aceptación. Esto NO toca las academias que YA EXISTEN (tienen su fila,
-- explícita) — esas se encienden aparte, DESPUÉS de dar acceso a todos sus
-- alumnos actuales, para que nadie se quede fuera de golpe (ver el aviso al
-- final de este guion).
--
-- CÓMO EJECUTARLO
-- Supabase -> SQL Editor -> pegar -> Run. Es idempotente: se puede repetir.
-- Después: `node scripts/schema-snapshot.mjs`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · `pending` como tercer estado de `memberships.access_status`
-- -----------------------------------------------------------------------------
ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_access_status_check;
ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_access_status_check
  CHECK (access_status IN ('active', 'suspended', 'pending'));


-- -----------------------------------------------------------------------------
-- PASO 2 · Exento de pago
-- -----------------------------------------------------------------------------
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.memberships.exempt IS
  'P12: acceso ilimitado y sin pago, por estar en la lista blanca de la academia.';


-- -----------------------------------------------------------------------------
-- PASO 3 · Una academia NUEVA nace cerrada (antes nacía abierta, regla 52)
-- -----------------------------------------------------------------------------
ALTER TABLE public.membership_settings ALTER COLUMN required SET DEFAULT true;


-- -----------------------------------------------------------------------------
-- PASO 4 · La lista blanca de exentos, por academia
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.membership_exemptions (
  organization_id uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  email           text NOT NULL,
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, email)
);

COMMENT ON TABLE public.membership_exemptions IS
  'P12: correos que entran directos (active + exempt), sin pasar por la solicitud de alta.';

ALTER TABLE public.membership_exemptions ENABLE ROW LEVEL SECURITY;
-- Sin políticas, a propósito (regla 34): solo la clave de servicio, detrás de
-- `requireAdmin`.


-- -----------------------------------------------------------------------------
-- PASO 5 · Comprobación
-- -----------------------------------------------------------------------------
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.memberships'::regclass AND contype = 'c';
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'memberships' AND column_name = 'exempt';
--
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'membership_exemptions';


-- =============================================================================
-- DESPUÉS DE EJECUTAR ESTO: dos pasos MÁS, fuera de este guion (los hace la
-- app con la clave de servicio, no hace falta SQL a mano) —
--   1. Dar acceso de golpe a TODOS los alumnos actuales de Alphapol y atenea
--      (igual que el botón "Activar a todos" de la pestaña Alumnos).
--   2. Encender `membership_settings.required = true` en las dos.
-- Sin el paso 1 antes que el 2, encender el interruptor dejaría fuera a los
-- alumnos que ya están usando la plataforma hoy.
-- =============================================================================
