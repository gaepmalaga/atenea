'use server'

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import { paginaCompleta } from '../lib/pagination';
import { ahoraEnZona } from '../lib/asistencia';
import {
  cuotaDeAlumno,
  cambiosParaAbrirMes,
  resumeCuotasMes,
  resumeHistoricoCuotas,
  leeApunte,
  aplicaCobro,
  estadoDe,
  alDia,
  leeImporte,
  numONull,
  periodoEnZona,
  esPeriodo,
  sumaMeses,
  mesesHasta,
  tiposDePack,
  nombreDePack,
  centimos,
  type Cuota,
  type Tarifa,
  type FilaPagoBD,
  type ResumenCuotasMes,
  type HistoricoCuotas,
  type EstadoPago,
} from '../lib/cuotas';

/**
 * PAGOS Y CUOTAS (P8, rehecho en la regla 102).
 *
 * El dueño cobra en efectivo. Pone el precio de cada tipo de grupo y los
 * packs en «Grupos»; la cuota de cada alumno sale de sus grupos (o de la suya
 * propia, si se la puso a mano). Cada mes, `monthly_payments` guarda por
 * alumno lo que DEBÍA (`due_eur`) y lo COBRADO (`amount_eur`), que puede ser
 * menos: un pago a medias.
 *
 * QUIÉN ENTRA EN UN MES: los alumnos con acceso activo y no exentos. Al mirar
 * los pagos, el mes en curso se ABRE: cada uno tiene su fila con su cuota
 * (`cambiosParaAbrirMes`). Quien entra a mitad de mes paga el mes entero (lo
 * decidió el dueño). Quien se va sigue en los meses en que estuvo.
 *
 * `paid` sigue queriendo decir «de ese mes no debe nada»: lo leen el panel de
 * Alumnos y el perfil del alumno.
 *
 * Todo con la clave de servicio, detrás de `requireAdmin`, y acotado por
 * `organization_id` DENTRO de cada consulta (reglas 34, 65 y 75). Un alumno
 * que llega de un parámetro se comprueba que es de la academia antes de
 * escribir nada sobre él.
 */

const MESES_HISTORICO = 12;

/** Una persona de la academia, con lo que hace falta para su cuota. */
type PersonaCuota = {
  userId: string;
  email: string | null;
  activo: boolean;
  exento: boolean;
  propia: number | null;
  notaPropia: string | null;
  tipos: string[];
};

export type AlumnoCuota = {
  userId: string;
  email: string | null;
  cuota: Cuota;
  notaPropia: string | null;
  grupos: string[];
};

export type PagosVista = {
  /** El mes en curso (en la hora de la academia). */
  actual: string;
  /** El mes que se está mirando. */
  periodo: string;
  /** El mes que se mira es el siguiente: solo previsión. */
  esPrevision: boolean;
  mes: ResumenCuotasMes;
  historico: HistoricoCuotas;
  /** Lo que se espera cobrar el mes que viene con los alumnos y la tarifa de hoy. */
  prevision: { periodo: string; previsto: number; alumnos: number; sinCuota: number };
  /** Lo que impide calcular alguna cuota. */
  avisos: { sinPrecio: { tipo: string; alumnos: number }[]; sinGrupos: string[]; tarifaVacia: boolean };
  /** La cuota de hoy de cada alumno activo (para cambiarle la suya). */
  cuotas: AlumnoCuota[];
};

/** El tipo de grupo y los packs de la academia → la tarifa. */
async function cargaTarifa(organizationId: string): Promise<{ tarifa: Tarifa; error: string | null }> {
  const [kindsRes, packsRes] = await Promise.all([
    supabaseAdmin.from('group_kinds').select('id, label, price_eur, sort_order').eq('organization_id', organizationId).order('sort_order').order('label'),
    supabaseAdmin.from('fee_packs').select('id, name, kinds, price_eur').eq('organization_id', organizationId).order('name'),
  ]);
  const error = kindsRes.error?.message ?? packsRes.error?.message ?? null;
  return {
    error,
    tarifa: {
      tipos: (kindsRes.data ?? []).map((k) => ({ id: k.id as string, label: k.label as string, precio: numONull(k.price_eur) })),
      packs: (packsRes.data ?? []).map((p) => ({
        id: p.id as string,
        nombre: p.name as string,
        tipos: Array.isArray(p.kinds) ? (p.kinds as string[]) : [],
        precio: numONull(p.price_eur) ?? 0,
      })),
    },
  };
}

/**
 * Los alumnos de la academia con su acceso, su cuota propia y los tipos de
 * sus grupos. Paginado: PostgREST corta a 1.000 filas sin avisar (regla 74).
 */
async function cargaPersonas(organizationId: string): Promise<{ personas: PersonaCuota[]; grupos: Map<string, string[]>; error: string | null }> {
  const miembros = await paginaCompleta<{ user_id: string }>(async (d, h) => await
    supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', organizationId).order('user_id').range(d, h));
  if (miembros.error) return { personas: [], grupos: new Map(), error: miembros.error };
  const ids = miembros.data.map((m) => m.user_id);
  if (!ids.length) return { personas: [], grupos: new Map(), error: null };

  const [perfiles, membresias, gruposRes] = await Promise.all([
    paginaCompleta<{ id: string; email: string | null; role: string | null }>(async (d, h) => await
      supabaseAdmin.from('profiles').select('id, email, role').eq('role', 'student').in('id', ids).order('id').range(d, h)),
    paginaCompleta<{ user_id: string; access_status: string; exempt: boolean; custom_fee_eur: number | string | null; custom_fee_note: string | null }>(async (d, h) => await
      supabaseAdmin.from('memberships').select('user_id, access_status, exempt, custom_fee_eur, custom_fee_note').eq('organization_id', organizationId).order('user_id').range(d, h)),
    supabaseAdmin.from('class_groups').select('id, name, kind').eq('organization_id', organizationId),
  ]);
  const error = perfiles.error ?? membresias.error ?? gruposRes.error?.message ?? null;
  if (error) return { personas: [], grupos: new Map(), error };

  const grupos = (gruposRes.data ?? []) as { id: string; name: string; kind: string }[];
  const miembrosGrupo = grupos.length
    ? await paginaCompleta<{ class_id: string; user_id: string }>(async (d, h) => await
        supabaseAdmin.from('class_members').select('class_id, user_id').in('class_id', grupos.map((g) => g.id)).order('class_id').order('user_id').range(d, h))
    : { data: [], error: null };
  if (miembrosGrupo.error) return { personas: [], grupos: new Map(), error: miembrosGrupo.error };

  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const tiposDe = new Map<string, Set<string>>();
  const nombresDe = new Map<string, string[]>();
  for (const m of miembrosGrupo.data) {
    const g = grupoPorId.get(m.class_id);
    if (!g) continue;
    const t = tiposDe.get(m.user_id) ?? new Set<string>();
    t.add(g.kind);
    tiposDe.set(m.user_id, t);
    nombresDe.set(m.user_id, [...(nombresDe.get(m.user_id) ?? []), g.name]);
  }
  const membresia = new Map(membresias.data.map((m) => [m.user_id, m]));

  const personas = perfiles.data.map((p) => {
    const m = membresia.get(p.id);
    return {
      userId: p.id,
      email: p.email ?? null,
      activo: m?.access_status === 'active',
      exento: m?.exempt === true,
      propia: numONull(m?.custom_fee_eur ?? null),
      notaPropia: m?.custom_fee_note ?? null,
      tipos: [...(tiposDe.get(p.id) ?? [])],
    };
  });
  return { personas, grupos: nombresDe, error: null };
}

const cuotaDe = (p: PersonaCuota, tarifa: Tarifa) =>
  cuotaDeAlumno({ tipos: p.tipos, tarifa, propia: p.propia, exento: p.exento });

/** `true` si el alumno es de la academia: lo que llega de un parámetro no se cree (regla 1). */
async function esDeLaAcademia(organizationId: string, userId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const { data, error } = await supabaseAdmin
    .from('academy_members')
    .select('user_id')
    .eq('academy_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  return !error && !!data;
}

/** La cuota de HOY de un alumno, para congelarla al cobrar un mes que aún no la tenía. */
async function cuotaDeHoy(organizationId: string, userId: string): Promise<number | null> {
  const [{ tarifa }, membresiaRes, gruposRes] = await Promise.all([
    cargaTarifa(organizationId),
    supabaseAdmin.from('memberships').select('exempt, custom_fee_eur').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle(),
    supabaseAdmin
      .from('class_members')
      .select('class_groups!inner(kind, organization_id)')
      .eq('user_id', userId)
      .eq('class_groups.organization_id', organizationId),
  ]);
  const tipos = (gruposRes.data ?? []).flatMap((r) => {
    const g = (r as { class_groups: { kind: string } | { kind: string }[] | null }).class_groups;
    return Array.isArray(g) ? g.map((x) => x.kind) : g ? [g.kind] : [];
  });
  return cuotaDeAlumno({
    tipos,
    tarifa,
    propia: numONull(membresiaRes.data?.custom_fee_eur ?? null),
    exento: membresiaRes.data?.exempt === true,
  }).importe;
}

/**
 * Pone el mes en curso al día: una fila por alumno activo con su cuota, y la
 * cuota de las que nadie ha tocado, al día con la tarifa. Nunca toca lo
 * cobrado, lo puesto a mano ni los meses pasados (`cambiosParaAbrirMes`).
 */
async function abreMes(organizationId: string, periodo: string, roster: { userId: string; importe: number | null }[]): Promise<string | null> {
  const { data, error } = await paginaCompleta<FilaPagoBD>(async (d, h) => await
    supabaseAdmin
      .from('monthly_payments')
      .select('user_id, period, paid, amount_eur, due_eur, due_manual')
      .eq('organization_id', organizationId)
      .eq('period', periodo)
      .order('user_id')
      .range(d, h));
  if (error) return error;
  const { nuevas, cambiar } = cambiosParaAbrirMes(roster, data);
  const ahora = new Date().toISOString();
  if (nuevas.length) {
    const { error: e } = await supabaseAdmin.from('monthly_payments').upsert(
      nuevas.map((n) => ({ organization_id: organizationId, user_id: n.userId, period: periodo, paid: false, due_eur: n.due, due_manual: false, updated_at: ahora })),
      { onConflict: 'organization_id,user_id,period', ignoreDuplicates: true },
    );
    if (e) return e.message;
  }
  for (const c of cambiar) {
    // Las mismas condiciones en la consulta: si entre medias alguien cobró o
    // la puso a mano, no se pisa.
    const { error: e } = await supabaseAdmin
      .from('monthly_payments')
      .update({ due_eur: c.due, paid: c.due === 0, updated_at: ahora })
      .eq('organization_id', organizationId)
      .eq('user_id', c.userId)
      .eq('period', periodo)
      .eq('due_manual', false)
      .is('amount_eur', null)
      .or('paid.eq.false,due_eur.eq.0');
    if (e) return e.message;
  }
  return null;
}

/**
 * Todo lo de la pantalla de Pagos de una vez: el mes que se mira, los últimos
 * 12 meses, quién debe, la previsión del mes que viene y los avisos.
 */
export async function getPagos(
  periodo?: string,
): Promise<{ success: true; data: PagosVista } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;

  const actual = periodoEnZona();
  const siguiente = sumaMeses(actual, 1);
  const p = esPeriodo(periodo) && periodo <= siguiente ? periodo : actual;

  const [{ tarifa, error: tarifaErr }, { personas, grupos, error: personasErr }] = await Promise.all([
    cargaTarifa(organizationId),
    cargaPersonas(organizationId),
  ]);
  if (tarifaErr || personasErr) {
    console.error('getPagos:', tarifaErr ?? personasErr);
    return { success: false as const, error: (tarifaErr ?? personasErr)! };
  }

  const cuotaPorId = new Map(personas.map((x) => [x.userId, cuotaDe(x, tarifa)]));
  const roster = personas.filter((x) => x.activo && !x.exento);

  const errAbrir = await abreMes(organizationId, actual, roster.map((r) => ({ userId: r.userId, importe: cuotaPorId.get(r.userId)!.importe })));
  if (errAbrir) {
    console.error('getPagos (abrir el mes):', errAbrir);
    return { success: false as const, error: errAbrir };
  }

  const periodos = mesesHasta(actual, MESES_HISTORICO);
  const desde = p < periodos[0] ? p : periodos[0];
  const filasRes = await paginaCompleta<FilaPagoBD>(async (d, h) => await
    supabaseAdmin
      .from('monthly_payments')
      .select('user_id, period, paid, amount_eur, due_eur, due_manual, paid_on, note')
      .eq('organization_id', organizationId)
      .gte('period', desde)
      .lte('period', siguiente)
      .order('period')
      .order('user_id')
      .range(d, h));
  if (filasRes.error) {
    console.error('getPagos:', filasRes.error);
    return { success: false as const, error: filasRes.error };
  }
  const filas = filasRes.data;
  const persona = new Map(personas.map((x) => [x.userId, x]));

  // EL MES QUE SE MIRA: quien tiene fila en él; y, si es el siguiente, la
  // previsión con los activos de hoy (los que ya pagaron por adelantado
  // tienen su fila).
  const filasMes = new Map(filas.filter((f) => f.period === p).map((f) => [f.user_id as string, f]));
  const esPrevision = p === siguiente;
  const ids = new Set<string>([...filasMes.keys(), ...(esPrevision ? roster.map((r) => r.userId) : [])]);
  const mes = resumeCuotasMes(p, [...ids].map((id) => ({
    userId: id,
    email: persona.get(id)?.email ?? null,
    activo: persona.get(id)?.activo ?? false,
    cuota: cuotaPorId.get(id) ?? null,
    fila: filasMes.get(id) ?? null,
  })));

  const historico = resumeHistoricoCuotas(
    periodos,
    actual,
    personas.filter((x) => !x.exento || filas.some((f) => f.user_id === x.userId)).map((x) => ({ userId: x.userId, email: x.email, activo: x.activo })),
    filas.filter((f) => typeof f.period === 'string' && f.period <= actual),
  );

  const cuotasRoster = roster.map((r) => cuotaPorId.get(r.userId)!);
  const faltan = new Map<string, number>();
  for (const c of cuotasRoster) for (const t of c.sinPrecio) faltan.set(t, (faltan.get(t) ?? 0) + 1);

  return {
    success: true as const,
    data: {
      actual,
      periodo: p,
      esPrevision,
      mes,
      historico,
      prevision: {
        periodo: siguiente,
        previsto: centimos(cuotasRoster.reduce((s, c) => s + (c.importe ?? 0), 0)),
        alumnos: roster.length,
        sinCuota: cuotasRoster.filter((c) => c.importe === null).length,
      },
      avisos: {
        sinPrecio: [...faltan].map(([tipo, alumnos]) => ({ tipo, alumnos })),
        sinGrupos: roster.filter((r) => cuotaPorId.get(r.userId)!.origen === 'sin_grupos').map((r) => r.email ?? r.userId),
        tarifaVacia: !tarifa.tipos.some((t) => t.precio !== null) && !tarifa.packs.length,
      },
      cuotas: roster
        .map((r) => ({ userId: r.userId, email: r.email, cuota: cuotaPorId.get(r.userId)!, notaPropia: r.notaPropia, grupos: grupos.get(r.userId) ?? [] }))
        .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? '', 'es')),
    },
  };
}

/** El mes que llega de la pantalla: un `YYYY-MM` válido y como mucho el que viene. */
function periodoValido(v: unknown): string | null {
  return esPeriodo(v) && v <= sumaMeses(periodoEnZona(), 1) ? v : null;
}

const hoyEnZona = () => ahoraEnZona(Date.now()).fecha;

/**
 * Cobrar. Sin cantidad, lo que falta de ese mes (el botón de un toque); con
 * cantidad, se SUMA a lo cobrado: un pago a medias, o lo que faltaba de él.
 */
export async function registraCobro(
  input: unknown,
): Promise<{ success: true; cobrado: number; estado: EstadoPago } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;

  const raw = (input ?? {}) as Record<string, unknown>;
  const studentId = typeof raw.studentId === 'string' ? raw.studentId : '';
  const period = periodoValido(raw.period);
  if (!studentId || !period) return { success: false as const, error: 'Falta el alumno o el mes.' };
  const cantidad = leeImporte(raw.cantidad);
  if (!cantidad.ok) return { success: false as const, error: cantidad.error };
  if (!(await esDeLaAcademia(organizationId, studentId))) return { success: false as const, error: 'Ese alumno no es de la academia.' };

  const { data: fila, error: filaErr } = await supabaseAdmin
    .from('monthly_payments')
    .select('paid, amount_eur, due_eur, due_manual')
    .eq('organization_id', organizationId)
    .eq('user_id', studentId)
    .eq('period', period)
    .maybeSingle();
  if (filaErr) return { success: false as const, error: filaErr.message };

  // Si el mes aún no sabía lo que debía, se congela con la cuota de hoy.
  const debido = fila && (fila.due_eur !== null || fila.due_manual === true)
    ? numONull(fila.due_eur)
    : await cuotaDeHoy(organizationId, studentId);
  const antes = leeApunte(fila ? { ...fila, due_eur: debido } : null, debido);
  const r = aplicaCobro({ debido, cobrado: antes.cobrado }, cantidad.valor);
  if (!r.ok) return { success: false as const, error: r.error };

  const { error } = await supabaseAdmin.from('monthly_payments').upsert(
    {
      organization_id: organizationId,
      user_id: studentId,
      period,
      due_eur: debido,
      due_manual: fila?.due_manual === true,
      amount_eur: r.cobrado,
      paid: alDia(r.estado),
      paid_on: hoyEnZona(),
      recorded_by: auth.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,user_id,period' },
  );
  if (error) return { success: false as const, error: error.message };
  registraAccion({ actorId: auth.user.id, action: 'registra_cobro', target: studentId, detail: { period, cantidad: cantidad.valor, cobrado: r.cobrado }, organizationId });
  return { success: true as const, cobrado: r.cobrado, estado: r.estado };
}

/** Deshacer lo cobrado de un mes: vuelve a «no ha pagado nada», con la misma cuota. */
export async function anulaCobro(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;

  const raw = (input ?? {}) as Record<string, unknown>;
  const studentId = typeof raw.studentId === 'string' ? raw.studentId : '';
  const period = periodoValido(raw.period);
  if (!studentId || !period) return { success: false as const, error: 'Falta el alumno o el mes.' };

  const { data: fila, error: filaErr } = await supabaseAdmin
    .from('monthly_payments')
    .select('due_eur')
    .eq('organization_id', organizationId)
    .eq('user_id', studentId)
    .eq('period', period)
    .maybeSingle();
  if (filaErr) return { success: false as const, error: filaErr.message };
  if (!fila) return { success: false as const, error: 'Ese mes no tiene nada cobrado.' };

  const { error } = await supabaseAdmin
    .from('monthly_payments')
    .update({ amount_eur: null, paid: alDia(estadoDe(numONull(fila.due_eur), 0)), paid_on: null, recorded_by: auth.user.id, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('user_id', studentId)
    .eq('period', period);
  if (error) return { success: false as const, error: error.message };
  registraAccion({ actorId: auth.user.id, action: 'anula_cobro', target: studentId, detail: { period }, organizationId });
  return { success: true as const };
}

/**
 * La cuota de UN mes, a mano: «este mes no viene: 0 €», «este mes, 25 €».
 * Vacía, vuelve a la de su tarifa. La nota dice por qué.
 */
export async function setCuotaMes(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;

  const raw = (input ?? {}) as Record<string, unknown>;
  const studentId = typeof raw.studentId === 'string' ? raw.studentId : '';
  const period = periodoValido(raw.period);
  if (!studentId || !period) return { success: false as const, error: 'Falta el alumno o el mes.' };
  const cuota = leeImporte(raw.cuota);
  if (!cuota.ok) return { success: false as const, error: cuota.error };
  const nota = typeof raw.nota === 'string' ? raw.nota.replace(/\0/g, '').trim().slice(0, 200) || null : null;
  if (!(await esDeLaAcademia(organizationId, studentId))) return { success: false as const, error: 'Ese alumno no es de la academia.' };

  const { data: fila, error: filaErr } = await supabaseAdmin
    .from('monthly_payments')
    .select('paid, amount_eur, due_eur')
    .eq('organization_id', organizationId)
    .eq('user_id', studentId)
    .eq('period', period)
    .maybeSingle();
  if (filaErr) return { success: false as const, error: filaErr.message };

  const manual = cuota.valor !== null;
  const debido = manual ? cuota.valor : await cuotaDeHoy(organizationId, studentId);
  const cobrado = leeApunte(fila ?? null).cobrado;

  const { error } = await supabaseAdmin.from('monthly_payments').upsert(
    {
      organization_id: organizationId,
      user_id: studentId,
      period,
      due_eur: debido,
      due_manual: manual,
      paid: alDia(estadoDe(debido, cobrado)),
      note: manual ? nota : null,
      recorded_by: auth.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,user_id,period' },
  );
  if (error) return { success: false as const, error: error.message };
  registraAccion({ actorId: auth.user.id, action: 'set_cuota_mes', target: studentId, detail: { period, cuota: debido, manual }, organizationId });
  return { success: true as const };
}

/**
 * La cuota PROPIA de un alumno, para todos los meses: manda sobre la tarifa
 * («su hermano también viene: 80 €»). Vacía, vuelve a la de sus grupos. El mes
 * en curso se pone al día al volver a Pagos, si aún no se le ha cobrado.
 */
export async function setCuotaPropia(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;

  const raw = (input ?? {}) as Record<string, unknown>;
  const studentId = typeof raw.studentId === 'string' ? raw.studentId : '';
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };
  const cuota = leeImporte(raw.cuota);
  if (!cuota.ok) return { success: false as const, error: cuota.error };
  const nota = cuota.valor === null ? null : typeof raw.nota === 'string' ? raw.nota.replace(/\0/g, '').trim().slice(0, 120) || null : null;

  const { data, error } = await supabaseAdmin
    .from('memberships')
    .update({ custom_fee_eur: cuota.valor, custom_fee_note: nota, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('user_id', studentId)
    .select('user_id');
  if (error) return { success: false as const, error: error.message };
  if (!data?.length) return { success: false as const, error: 'Ese alumno aún no tiene acceso a la academia.' };
  registraAccion({ actorId: auth.user.id, action: 'set_cuota_propia', target: studentId, detail: { cuota: cuota.valor }, organizationId });
  return { success: true as const };
}

// ============================================================
// LA TARIFA: PRECIO DE CADA TIPO Y PACKS (se edita en «Grupos»)
// ============================================================

export async function getTarifa(): Promise<{ success: true; tarifa: Tarifa } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: true as const, tarifa: { tipos: [], packs: [] } };
  const { tarifa, error } = await cargaTarifa(auth.user.organizationId);
  if (error) return { success: false as const, error };
  return { success: true as const, tarifa };
}

/** El precio al mes de un tipo de grupo. Vacío: «sin precio» (no 0 €). */
export async function setPrecioTipo(kindId: string, precio: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;
  if (typeof kindId !== 'string' || !kindId) return { success: false as const, error: 'Falta el tipo.' };
  const v = leeImporte(precio);
  if (!v.ok) return { success: false as const, error: v.error };

  const { data, error } = await supabaseAdmin
    .from('group_kinds')
    .update({ price_eur: v.valor })
    .eq('organization_id', organizationId)
    .eq('id', kindId)
    .select('id');
  if (error) return { success: false as const, error: error.message };
  if (!data?.length) return { success: false as const, error: 'Ese tipo de grupo no existe.' };
  registraAccion({ actorId: auth.user.id, action: 'set_precio_tipo', target: kindId, detail: { precio: v.valor }, organizationId });
  return { success: true as const };
}

/** Crea o cambia un pack: dos tipos o más, por un precio. Sin nombre, el de sus tipos. */
export async function savePack(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;

  const raw = (input ?? {}) as Record<string, unknown>;
  const { tarifa, error: tErr } = await cargaTarifa(organizationId);
  if (tErr) return { success: false as const, error: tErr };
  const tipos = tiposDePack(raw.tipos, tarifa.tipos.map((t) => t.id));
  if (tipos.length < 2) return { success: false as const, error: 'Un pack junta dos tipos de grupo o más.' };
  const precio = leeImporte(raw.precio);
  if (!precio.ok) return { success: false as const, error: precio.error };
  if (precio.valor === null) return { success: false as const, error: 'Pon el precio del pack.' };
  const nombreBruto = typeof raw.nombre === 'string' ? raw.nombre.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  const name = nombreBruto || nombreDePack(tipos, tarifa).slice(0, 60);
  const id = typeof raw.id === 'string' && /^[0-9a-f-]{36}$/i.test(raw.id) ? raw.id : null;

  const { error } = id
    ? await supabaseAdmin.from('fee_packs').update({ name, kinds: tipos, price_eur: precio.valor }).eq('organization_id', organizationId).eq('id', id)
    : await supabaseAdmin.from('fee_packs').insert({ organization_id: organizationId, name, kinds: tipos, price_eur: precio.valor });
  if (error) {
    if (error.code === '23505') return { success: false as const, error: 'Ya hay un pack con esos mismos tipos.' };
    return { success: false as const, error: error.message };
  }
  registraAccion({ actorId: auth.user.id, action: 'save_pack', target: name, detail: { tipos, precio: precio.valor }, organizationId });
  return { success: true as const };
}

export async function deletePack(packId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;
  if (typeof packId !== 'string' || !packId) return { success: false as const, error: 'Falta el pack.' };
  const { error } = await supabaseAdmin.from('fee_packs').delete().eq('organization_id', organizationId).eq('id', packId);
  if (error) return { success: false as const, error: error.message };
  registraAccion({ actorId: auth.user.id, action: 'delete_pack', target: packId, organizationId });
  return { success: true as const };
}
