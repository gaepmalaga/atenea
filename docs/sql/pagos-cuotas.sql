-- =============================================================================
-- PAGOS: LAS CUOTAS Y EL REGISTRO DE COBROS CON RECIBO (regla 104, 9 nov 2026)
-- =============================================================================
--
-- Lo pidió el dueño: «un lugar, en Grupos, donde poner el precio de cada
-- grupo: físicas 50, teoría 60, inglés 20, física, teoría e inglés 100… y
-- según los grupos de un alumno, lo que debe abonar al mes; y así tener
-- previsión de ingresos, lo cobrado y lo pendiente». Decidió: precio por TIPO
-- de grupo, quien entra a mitad de mes paga el mes entero, y cambiar un
-- precio NUNCA toca lo que se debía en los meses anteriores.
-- Y los dueños pidieron, al ver el rediseño, «datos contables»: el método y el
-- recibo de cada cobro, y el cierre de caja para el gestor.
--
-- SUSTITUYE a `pagos-contabilidad.sql` (que no llegó a ejecutarse): aquel
-- ponía el método y el recibo en la fila del MES, y un mes puede cobrarse en
-- dos veces (30 € el día 3 en efectivo y 20 € el 15 por bizum): son dos
-- cobros, dos recibos y dos días de caja distintos.
--
-- 1 · `group_kinds.price_eur`: lo que cuesta al mes un tipo de grupo. `null`
--     es «sin precio todavía», nunca 0 € (regla 16).
--
-- 2 · `fee_packs`: los packs («Teoría + Físicas + Inglés = 100 €»). A cada
--     alumno se le aplica la combinación MÁS BARATA de packs y precios sueltos
--     que cubre sus tipos (app/lib/cuotas.ts).
--
-- 3 · `memberships.custom_fee_eur` (+ nota): la cuota PROPIA de un alumno, que
--     manda sobre la tarifa («su hermano también viene: 80 €»).
--
-- 4 · `monthly_payments.due_eur`: lo que tenía que pagar ESE mes, congelado.
--     Mientras el mes está en curso y no se ha cobrado nada, el código la tiene
--     al día con la tarifa; al cobrar, o al acabar el mes, queda fija: cambiar
--     un precio en enero no reescribe lo que se debía en octubre.
--     `due_manual`: la cuota de ese mes la puso el dueño a mano («este mes no
--     viene: 0 €») y el código no la toca.
--     `amount_eur` y `paid` pasan a ser un RESUMEN de los cobros del mes (lo
--     leen Alumnos y el perfil del alumno); lo calcula `recalcula_mes`.
--
-- 5 · `payment_entries`: cada COBRO, con su número de recibo, su método, su
--     fecha y quién lo anotó. Es el libro de caja: no se borra; un cobro que
--     se deshace queda ANULADO (`voided_at`), con su número, como hace un
--     talonario. `alumno` guarda el correo del momento: si la cuenta se
--     borra, el apunte sigue diciendo de quién era.
--
-- 6 · `receipt_counters` y `registra_cobro(…)`: el recibo es correlativo por
--     academia. Una función, no un `max()+1` desde el código: dos cobros a la
--     vez sacarían el mismo número. Bloquea la fila del mes, suma el
--     contador, apunta el cobro y rehace el resumen en una sola transacción;
--     si algo falla, no se gasta el número.
--     `anula_cobros(…)` anula uno o todos los cobros de un mes y rehace el
--     resumen. `recalcula_mes(…)` es la cuenta, en un solo sitio.
--
-- Tablas con RLS y CERO políticas, como el resto del panel (regla 34): solo
-- la clave de servicio, detrás de `requireAdmin`. Las funciones, solo para la
-- clave de servicio.
--
-- No borra ni cambia ningún dato: añade columnas, tablas y funciones.
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

create table if not exists public.payment_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  alumno text not null check (char_length(alumno) between 1 and 320),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount_eur numeric(8,2) not null check (amount_eur > 0 and amount_eur < 10000),
  method text not null default 'efectivo' check (method in ('efectivo', 'bizum', 'transferencia', 'tarjeta')),
  receipt_no integer not null check (receipt_no > 0),
  paid_on date not null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  unique (organization_id, receipt_no)
);
alter table public.payment_entries enable row level security;
create index if not exists payment_entries_por_mes on public.payment_entries (organization_id, period);
create index if not exists payment_entries_por_dia on public.payment_entries (organization_id, paid_on);

create table if not exists public.receipt_counters (
  organization_id uuid primary key references public.academies(id) on delete cascade,
  last_no integer not null default 0 check (last_no >= 0)
);
alter table public.receipt_counters enable row level security;

-- El resumen del mes a partir de sus cobros. `paid` = «de ese mes no debe
-- nada», con la misma cuenta que `estadoDe` en app/lib/cuotas.ts.
create or replace function public.recalcula_mes(p_org uuid, p_user uuid, p_period text)
returns void
language sql
set search_path to 'public'
as $$
  update public.monthly_payments m set
    amount_eur = nullif(s.total, 0),
    paid = case
      when m.due_eur is null then s.total > 0
      when m.due_eur <= 0 then true
      else s.total >= m.due_eur - 0.005
    end,
    paid_on = s.ultimo,
    updated_at = now()
  from (
    select coalesce(sum(e.amount_eur), 0) as total, max(e.paid_on) as ultimo
    from public.payment_entries e
    where e.organization_id = p_org and e.user_id = p_user and e.period = p_period and e.voided_at is null
  ) s
  where m.organization_id = p_org and m.user_id = p_user and m.period = p_period;
$$;

create or replace function public.registra_cobro(
  p_org uuid, p_user uuid, p_alumno text, p_period text,
  p_amount numeric, p_method text, p_paid_on date, p_by uuid
)
returns table (entry_id uuid, receipt integer)
language plpgsql
set search_path to 'public'
as $$
declare
  v_no integer;
  v_id uuid;
begin
  -- La fila del mes (con su cuota ya congelada) la pone antes el código; se
  -- bloquea para que dos cobros del mismo alumno y mes vayan uno detrás de otro.
  perform 1 from public.monthly_payments
    where organization_id = p_org and user_id = p_user and period = p_period
    for update;
  if not found then
    raise exception 'No existe la fila de % para ese alumno', p_period;
  end if;

  insert into public.receipt_counters as rc (organization_id, last_no) values (p_org, 1)
    on conflict (organization_id) do update set last_no = rc.last_no + 1
    returning rc.last_no into v_no;

  insert into public.payment_entries (organization_id, user_id, alumno, period, amount_eur, method, receipt_no, paid_on, recorded_by)
    values (p_org, p_user, p_alumno, p_period, p_amount, p_method, v_no, p_paid_on, p_by)
    returning id into v_id;

  perform public.recalcula_mes(p_org, p_user, p_period);
  return query select v_id, v_no;
end;
$$;

create or replace function public.anula_cobros(p_org uuid, p_user uuid, p_period text, p_entry uuid, p_by uuid)
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  perform 1 from public.monthly_payments
    where organization_id = p_org and user_id = p_user and period = p_period
    for update;
  update public.payment_entries
    set voided_at = now(), voided_by = p_by
    where organization_id = p_org and user_id = p_user and period = p_period
      and voided_at is null and (p_entry is null or id = p_entry);
  get diagnostics v_n = row_count;
  perform public.recalcula_mes(p_org, p_user, p_period);
  return v_n;
end;
$$;

revoke all on function public.recalcula_mes(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.registra_cobro(uuid, uuid, text, text, numeric, text, date, uuid) from public, anon, authenticated;
revoke all on function public.anula_cobros(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.recalcula_mes(uuid, uuid, text) to service_role;
grant execute on function public.registra_cobro(uuid, uuid, text, text, numeric, text, date, uuid) to service_role;
grant execute on function public.anula_cobros(uuid, uuid, text, uuid, uuid) to service_role;
