-- =============================================================================
-- P6 — Control de acceso y registro de pagos en efectivo
-- =============================================================================
--
-- ✅ EJECUTADO el 5 sep 2026 contra el Supabase real. Las tres tablas existen,
--    `membership_settings` tiene su fila id=1 (required=false), y se comprobó
--    con `node scripts/schema-snapshot.mjs`. Se deja el fichero por ser
--    idempotente y por el porqué de cada decisión.
--
-- QUÉ RESUELVE
-- La academia cobra EN EFECTIVO, en persona. No hay pasarela, ni suscripciones,
-- ni IVA de la UE. Lo que hace falta es:
--   · saber quién ha pagado y quién no (un registro que lleva el administrador);
--   · que solo entren los alumnos que el administrador ha activado;
--   · poder quitarle el acceso a quien deja de pagar o pide la baja.
--
-- Sustituye a la idea de "cobros online" de PLAN-PRODUCTO.md P6, que asumía
-- captar alumnos por internet. El modelo real es una academia física.
--
-- TRES TABLAS, TODAS DE ADMINISTRACIÓN
--   · membership_settings — UNA FILA (id = 1). El interruptor global
--     `required`: mientras esté a `false` (por defecto) NADIE queda fuera —
--     la plataforma sigue como hoy, con todos dentro. Cuando se pone a `true`,
--     solo entran los alumnos con fila en `memberships` y `access_status =
--     'active'`.
--   · memberships — estado de acceso y de pago por alumno. **SIN FILA =
--     PENDIENTE**: un alumno recién registrado no tiene fila y, con el
--     interruptor encendido, no entra hasta que el administrador lo active
--     (lo que crea su fila). Misma idea que `module_settings` (P4), pero al
--     revés: allí "sin fila" es activo porque un módulo nuevo debe aparecer;
--     aquí "sin fila" es pendiente porque un alumno nuevo NO debe entrar solo.
--   · academy_payments — el registro de cada pago en efectivo: fecha, importe,
--     nota y quién lo apuntó.
--
-- EL ACCESO NO CADUCA SOLO. `payment_status` ('al_dia' | 'debe') es un aviso
-- visual para el administrador, no una puerta: quitar el acceso lo hace él a
-- mano poniendo `access_status = 'suspended'`. Así un despiste apuntando un
-- pago no deja fuera a quien sí pagó.
--
-- CERO POLÍTICAS DE RLS, A PROPÓSITO (regla 34). Esto es del administrador. La
-- aplicación entra con la clave de servicio (que salta RLS) y detrás de
-- `requireAdmin` / la guarda de acceso. Con la sesión del alumno estas tablas
-- devolverían cero filas, que es justo el modo de fallo que hay que evitar.
--
-- QUÉ PASA CON LOS QUE YA ESTÁN
-- Nada, mientras `required` sea `false`. Cuando se vaya a encender, el panel
-- tiene un botón "dar acceso a los alumnos actuales" que crea una fila
-- `active` para cada perfil de rol `student` que ya existe. Después de eso,
-- "sin fila" solo les pasa a los que se registren a partir de entonces.
--
-- COMO EJECUTARLO
-- Supabase -> SQL Editor -> pegar -> Run. Es idempotente: se puede repetir.
-- Después: `node scripts/schema-snapshot.mjs`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · El interruptor global
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.membership_settings (
  id         integer     PRIMARY KEY DEFAULT 1,
  -- false = plataforma abierta, como hoy. true = solo alumnos activados.
  required   boolean     NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT membership_settings_singleton CHECK (id = 1)
);

COMMENT ON TABLE public.membership_settings IS
  'Interruptor global del control de acceso. Una fila (id=1). required=false: todos dentro.';


-- -----------------------------------------------------------------------------
-- PASO 2 · El estado de cada alumno
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.memberships (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'active' cuando el administrador le da acceso; 'suspended' cuando se lo
  -- quita. NO existe 'pending': eso es la AUSENCIA de fila.
  access_status  text NOT NULL DEFAULT 'active'
                 CHECK (access_status IN ('active', 'suspended')),
  -- Aviso para el administrador, no una puerta. El acceso lo corta él a mano.
  payment_status text NOT NULL DEFAULT 'al_dia'
                 CHECK (payment_status IN ('al_dia', 'debe')),
  note           text,
  updated_at     timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.memberships IS
  'Acceso y estado de pago por alumno. SIN FILA = pendiente de activar.';


-- -----------------------------------------------------------------------------
-- PASO 3 · El registro de pagos en efectivo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academy_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- El importe puede ir vacío: a veces solo interesa dejar constancia de que
  -- ese mes pagó. `numeric` para no perder los céntimos.
  amount_eur  numeric(10, 2),
  paid_on     date NOT NULL DEFAULT current_date,
  note        text,
  -- Quién lo apuntó. `set null` si esa cuenta de admin se borra: el pago sigue
  -- siendo válido aunque el que lo registró ya no esté.
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academy_payments_user_idx
  ON public.academy_payments (user_id, paid_on DESC);

COMMENT ON TABLE public.academy_payments IS
  'Un registro por pago en efectivo. Lo lleva el administrador a mano.';


-- -----------------------------------------------------------------------------
-- PASO 4 · RLS: las tres, administración pura
-- -----------------------------------------------------------------------------
ALTER TABLE public.membership_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_payments    ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo la clave de servicio. La guarda de acceso y `requireAdmin`
-- hacen el trabajo que aquí haría una política de propietario.


-- -----------------------------------------------------------------------------
-- PASO 5 · Comprobación
-- -----------------------------------------------------------------------------
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relname IN ('membership_settings', 'memberships', 'academy_payments');
--
-- (Las tres con relrowsecurity = true y ninguna política.)
