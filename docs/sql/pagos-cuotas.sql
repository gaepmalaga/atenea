-- =============================================================================
-- CUOTAS: EL PRECIO DE CADA TIPO DE GRUPO, LOS PACKS Y LO QUE DEBE CADA MES
-- (regla 102, 9 nov 2026)
-- =============================================================================
--
-- Lo pidió el dueño: «un lugar, en Grupos, donde poner el precio de cada
-- grupo: físicas 50, teoría 60, inglés 20, física, teoría e inglés 100… y
-- según los grupos de un alumno, lo que debe abonar al mes; y así tener
-- previsión de ingresos, lo cobrado y lo pendiente». Decidió: precio por TIPO
-- de grupo (no por grupo), y quien entra a mitad de mes paga el mes entero.
--
-- 1 · `group_kinds.price_eur`: lo que cuesta al mes un tipo de grupo. `null`
--     es «sin precio todavía», nunca 0 € (regla 16): un alumno con un tipo sin
--     precio sale con la cuota sin calcular y un aviso, no gratis.
--
-- 2 · `fee_packs`: los packs («Teoría + Físicas + Inglés = 100 €»). `kinds`
--     son los `id` de `group_kinds`, guardados ordenados para que el mismo
--     pack no se pueda meter dos veces. A cada alumno se le aplica la
--     combinación MÁS BARATA de packs y precios sueltos que cubre sus tipos
--     (la calcula el código: app/lib/cuotas.ts). RLS y CERO políticas, como el
--     resto del panel: solo la clave de servicio, detrás de `requireAdmin`.
--
-- 3 · `memberships.custom_fee_eur` (+ nota): la cuota PROPIA de un alumno, que
--     manda sobre la tarifa («su hermano también viene: 80 €»). `null` = la de
--     la tarifa.
--
-- 4 · `monthly_payments.due_eur`: lo que tenía que pagar ESE mes. Hasta hoy la
--     fila solo decía si pagó; ahora dice también cuánto debía, para que
--     cambiar los precios en enero no reescriba lo que se debía en octubre.
--     Mientras el mes está abierto y no se ha cobrado nada, el código la tiene
--     al día con la tarifa; al cobrar, queda fija. `amount_eur` sigue siendo
--     lo COBRADO, y puede ser menos que lo debido (un pago a medias: «trajo
--     30 de 50, faltan 20»).
--     `due_manual`: la cuota de ese mes la puso el dueño a mano («este mes no
--     viene: 0 €») y el código no la toca.
--
-- No borra ni cambia ningún dato: solo añade columnas y una tabla.
-- Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

alter table public.group_kinds
  add column if not exists price_eur numeric(8,2)
  check (price_eur is null or (price_eur >= 0 and price_eur < 10000));

create table if not exists public.fee_packs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kinds text[] not null check (cardinality(kinds) between 2 and 20),
  price_eur numeric(8,2) not null check (price_eur >= 0 and price_eur < 10000),
  created_at timestamptz not null default now(),
  unique (organization_id, kinds)
);
alter table public.fee_packs enable row level security;

alter table public.memberships
  add column if not exists custom_fee_eur numeric(8,2)
  check (custom_fee_eur is null or (custom_fee_eur >= 0 and custom_fee_eur < 10000));
alter table public.memberships
  add column if not exists custom_fee_note text
  check (custom_fee_note is null or char_length(custom_fee_note) <= 120);

alter table public.monthly_payments
  add column if not exists due_eur numeric(8,2)
  check (due_eur is null or (due_eur >= 0 and due_eur < 10000));
alter table public.monthly_payments
  add column if not exists due_manual boolean not null default false;
