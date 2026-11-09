-- =============================================================================
-- PAGOS: LA CONTABILIDAD (regla 102, noviembre 2026)
-- =============================================================================
--
-- Lo pidieron los dueños de Alphapol al ver el rediseño de «Pagos»: más datos
-- «contables» para controlar la academia. Eligieron tres cosas: un resumen de
-- ingresos, el cierre de caja con exportación, y el método, el concepto y el
-- recibo de cada cobro.
--
-- 1 · `monthly_payments.method`: cómo se cobró (efectivo, bizum, transferencia
--     o tarjeta). NULL = no se anotó, que es distinto de «efectivo».
--
-- 2 · `monthly_payments.receipt_no`: el número del recibo, correlativo por
--     academia. NULL = no se emitió.
--
-- 3 · `receipt_counters` y `next_receipt_no(org)`: el contador de recibos.
--     Una función y no un `max()+1` desde el código: dos cobros a la vez
--     habrían sacado el mismo número. La función suma y devuelve en un solo
--     paso, así que cada recibo tiene el suyo, y se hace con un `upsert`
--     atómico.
--
-- La CUOTA por alumno o por academia, y los descuentos, NO están en este guion:
-- hoy el importe se anota al cobrar y el pendiente se estima con la media de
-- los que ya han pagado. Se añadirían aquí cuando la academia lo pida.
--
-- El «concepto» de un cobro mensual es siempre «Mensualidad». Otros conceptos
-- (matrícula, material) llevarían otra tabla de cobros sueltos: no se hace
-- hasta que la academia lo pida de verdad.
--
-- Las tablas nuevas, con RLS y CERO políticas, como el resto del panel (regla
-- 34): solo la clave de servicio, detrás de `requireAdmin`.
--
-- SOLO AÑADE: ninguna columna ni fila existente cambia. El código funciona con
-- y sin este guion: sin él, la pantalla de pagos sigue igual y las opciones de
-- método, recibo y cuota no se ofrecen.
--
-- Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

alter table public.monthly_payments add column if not exists method text;
alter table public.monthly_payments add column if not exists receipt_no integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'monthly_payments_method_check') then
    alter table public.monthly_payments
      add constraint monthly_payments_method_check
      check (method is null or method in ('efectivo', 'bizum', 'transferencia', 'tarjeta'));
  end if;
end $$;

-- Dos recibos de la misma academia nunca comparten número.
create unique index if not exists monthly_payments_recibo_unico
  on public.monthly_payments (organization_id, receipt_no)
  where receipt_no is not null;

create table if not exists public.receipt_counters (
  organization_id uuid primary key references public.academies(id) on delete cascade,
  last_no integer not null default 0 check (last_no >= 0)
);
alter table public.receipt_counters enable row level security;

create or replace function public.next_receipt_no(p_org uuid)
returns integer
language sql
set search_path to 'public'
as $$
  insert into public.receipt_counters (organization_id, last_no)
  values (p_org, 1)
  on conflict (organization_id) do update set last_no = public.receipt_counters.last_no + 1
  returning last_no;
$$;
revoke all on function public.next_receipt_no(uuid) from public, anon, authenticated;
grant execute on function public.next_receipt_no(uuid) to service_role;

-- Para comprobar que ha salido bien:
--   select column_name from information_schema.columns
--    where table_name = 'monthly_payments' and column_name in ('method', 'receipt_no');
--   select public.next_receipt_no('<id de la academia de pruebas>');  -- ojo: gasta un número
