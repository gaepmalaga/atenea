/**
 * LAS CUOTAS (regla 102).
 *
 * El dueño pone el precio de cada TIPO de grupo (Teoría 60 €, Físicas 50 €,
 * Inglés 20 €) y los packs que quiera («Teoría + Físicas + Inglés = 100 €»).
 * La cuota de cada alumno sale de los tipos de sus grupos: la combinación MÁS
 * BARATA de packs y precios sueltos que los cubre. Así un pack nunca le cobra
 * más que ir suelto, y estar en dos grupos de Físicas cuenta una vez.
 *
 * Cada mes, la fila de `monthly_payments` guarda lo que DEBÍA (`due_eur`) y lo
 * que se COBRÓ (`amount_eur`), que puede ser menos: un pago a medias («trajo
 * 30 de 50, faltan 20»). De ahí sale lo previsto, lo cobrado, lo pendiente y
 * quién debe.
 *
 * Dos reglas de siempre, que aquí son dinero:
 *  · «Sin precio» no es 0 € (reglas 8 y 16). Un alumno con un tipo sin precio
 *    tiene la cuota SIN CALCULAR, y se avisa; no sale gratis.
 *  · Los céntimos se redondean al sumar: 0,1 + 0,2 no es 0,30000000000000004 €.
 *
 * Módulo PURO (regla 21).
 */

import { ahoraEnZona } from './asistencia.ts';

// ============================================================
// IMPORTES
// ============================================================

/** Lo máximo que cabe en `numeric(8,2)` con el `check` de la tabla. */
export const MAX_EUR = 9999.99;

/** Redondeo a céntimos. */
export const centimos = (x: number): number => Math.round(x * 100) / 100;

/** Dos importes son el mismo si coinciden al céntimo; `null` solo es igual a `null`. */
export function mismoImporte(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.005;
}

/**
 * Lo que escribe el dueño en un campo de euros: «50», «50,5», «50.50 €».
 * Vacío es `null` (regla 16). Nada de separador de miles: «1.000» es un error,
 * no mil euros ni un euro.
 */
export function leeImporte(v: unknown): { ok: true; valor: number | null } | { ok: false; error: string } {
  if (v === null || v === undefined) return { ok: true, valor: null };
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0 || v > MAX_EUR) return { ok: false, error: 'El importe no es válido.' };
    return { ok: true, valor: centimos(v) };
  }
  if (typeof v !== 'string') return { ok: false, error: 'El importe no es válido.' };
  const t = v.replace(/\0/g, '').replace(/€/g, '').replace(/\s+/g, '');
  if (!t) return { ok: true, valor: null };
  if (!/^\d{1,4}(?:[.,]\d{1,2})?$/.test(t)) return { ok: false, error: `No entiendo «${v.trim()}». Escribe el importe así: 50 o 49,90.` };
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n > MAX_EUR) return { ok: false, error: 'El importe no es válido.' };
  return { ok: true, valor: centimos(n) };
}

/** Número o cadena numérica de PostgREST → número; vacío o ilegible → `null`. */
export function numONull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 50 → «50 €»; 49.9 → «49,90 €»; 2675 → «2.675 €». `null` → «—». */
export function eur(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  const entero = Math.abs(valor - Math.round(valor)) < 0.005;
  // `useGrouping: 'always'`: en es-ES, Intl no pone el punto a los de cuatro
  // cifras («2675 €»); en dinero se lee mejor «2.675 €».
  const txt = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: entero ? 0 : 2,
    maximumFractionDigits: entero ? 0 : 2,
    useGrouping: 'always',
  } as Intl.NumberFormatOptions).format(entero ? Math.round(valor) : valor);
  return `${txt} €`;
}

// ============================================================
// LA TARIFA Y LA CUOTA DE CADA ALUMNO
// ============================================================

/** Un tipo de grupo con su precio al mes (`null`: sin precio todavía). */
export type TipoConPrecio = { id: string; label: string; precio: number | null };
/** Un pack: varios tipos juntos por un precio. */
export type Pack = { id: string; nombre: string; tipos: string[]; precio: number };
export type Tarifa = { tipos: TipoConPrecio[]; packs: Pack[] };

export type ParteCuota = { nombre: string; precio: number; esPack: boolean };
export type OrigenCuota = 'tarifa' | 'propia' | 'exento' | 'sin_grupos' | 'sin_precio';

export type Cuota = {
  /** Lo que paga al mes; `null` si no se puede calcular (y `origen` dice por qué). */
  importe: number | null;
  origen: OrigenCuota;
  /** De qué sale: «Pack completo 100 €» o «Teoría 60 € + Inglés 20 €». */
  partes: ParteCuota[];
  /** Los tipos que le faltan por precio (por su nombre). */
  sinPrecio: string[];
  /** Una línea para la pantalla. */
  detalle: string;
};

/** Cuántos packs se combinan como mucho al buscar el más barato (2^12 combinaciones). */
const MAX_PACKS_COMBINADOS = 12;

/**
 * La cuota de un alumno. Manda, por este orden: exento (no paga), su cuota
 * propia (la que le puso el dueño), y la tarifa: la combinación más barata de
 * packs sin solaparse y precios sueltos que cubre todos sus tipos.
 */
export function cuotaDeAlumno(p: {
  tipos: string[];
  tarifa: Tarifa;
  propia?: number | null;
  exento?: boolean;
}): Cuota {
  if (p.exento) return { importe: null, origen: 'exento', partes: [], sinPrecio: [], detalle: 'Exento de pago' };
  if (typeof p.propia === 'number' && Number.isFinite(p.propia)) {
    const importe = centimos(p.propia);
    return { importe, origen: 'propia', partes: [{ nombre: 'Cuota propia', precio: importe, esPack: false }], sinPrecio: [], detalle: 'Cuota propia' };
  }

  const tipos = [...new Set(p.tipos.filter(Boolean))];
  if (!tipos.length) return { importe: null, origen: 'sin_grupos', partes: [], sinPrecio: [], detalle: 'Sin grupos: no tiene cuota' };

  const orden = new Map(p.tarifa.tipos.map((t, i) => [t.id, i]));
  const precio = new Map(p.tarifa.tipos.map((t) => [t.id, t.precio]));
  const etiqueta = (id: string) => p.tarifa.tipos.find((t) => t.id === id)?.label ?? id;
  const suyos = new Set(tipos);
  const packs = p.tarifa.packs
    .filter((pk) => pk.tipos.length >= 2 && Number.isFinite(pk.precio) && pk.tipos.every((t) => suyos.has(t)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id))
    .slice(0, MAX_PACKS_COMBINADOS);

  type Opcion = { coste: number; faltan: string[]; enPack: number; packs: Pack[]; sueltos: string[] };
  let mejor: Opcion | null = null;
  for (let mask = 0; mask < 1 << packs.length; mask++) {
    const usados = new Set<string>();
    const elegidos: Pack[] = [];
    let solapan = false;
    for (let i = 0; i < packs.length && !solapan; i++) {
      if (!(mask & (1 << i))) continue;
      if (packs[i].tipos.some((t) => usados.has(t))) solapan = true;
      else { packs[i].tipos.forEach((t) => usados.add(t)); elegidos.push(packs[i]); }
    }
    if (solapan) continue;
    const sueltos = tipos.filter((t) => !usados.has(t));
    const faltan = sueltos.filter((t) => precio.get(t) == null);
    const coste = elegidos.reduce((s, pk) => s + pk.precio, 0) + sueltos.reduce((s, t) => s + (precio.get(t) ?? 0), 0);
    const op: Opcion = { coste: centimos(coste), faltan, enPack: usados.size, packs: elegidos, sueltos };
    // Primero, que no falte ningún precio; luego, lo más barato; a igualdad,
    // lo que más cubren los packs (el dueño los pone para usarlos).
    if (!mejor
      || op.faltan.length < mejor.faltan.length
      || (op.faltan.length === mejor.faltan.length && (op.coste < mejor.coste - 0.005
        || (mismoImporte(op.coste, mejor.coste) && op.enPack > mejor.enPack)))) {
      mejor = op;
    }
  }

  const m = mejor!;
  if (m.faltan.length) {
    const sinPrecio = m.faltan.sort((a, b) => (orden.get(a) ?? 99) - (orden.get(b) ?? 99)).map(etiqueta);
    return { importe: null, origen: 'sin_precio', partes: [], sinPrecio, detalle: `Falta el precio de ${listaY(sinPrecio)}` };
  }
  const partes: ParteCuota[] = [
    ...m.packs.map((pk) => ({ nombre: pk.nombre, precio: pk.precio, esPack: true })),
    ...m.sueltos
      .sort((a, b) => (orden.get(a) ?? 99) - (orden.get(b) ?? 99))
      .map((t) => ({ nombre: etiqueta(t), precio: precio.get(t) ?? 0, esPack: false })),
  ];
  return {
    importe: m.coste,
    origen: 'tarifa',
    partes,
    sinPrecio: [],
    detalle: partes.map((x) => `${x.nombre} ${eur(x.precio)}`).join(' + '),
  };
}

/** «a», «a y b», «a, b y c». */
export function listaY(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
}

/** Lo que cuestan por separado los tipos de un pack; `null` si alguno no tiene precio. */
export function precioSuelto(tipos: string[], tarifa: Tarifa): number | null {
  let s = 0;
  for (const t of tipos) {
    const p = tarifa.tipos.find((x) => x.id === t)?.precio;
    if (p == null) return null;
    s += p;
  }
  return centimos(s);
}

/** El nombre de un pack que no lo tiene: sus tipos, por orden. */
export function nombreDePack(tipos: string[], tarifa: Tarifa): string {
  const orden = new Map(tarifa.tipos.map((t, i) => [t.id, i]));
  return [...tipos]
    .sort((a, b) => (orden.get(a) ?? 99) - (orden.get(b) ?? 99))
    .map((t) => tarifa.tipos.find((x) => x.id === t)?.label ?? t)
    .join(' + ');
}

/** Los tipos de un pack, limpios: sin repetidos, solo los que existen, ordenados (así se guardan). */
export function tiposDePack(v: unknown, existentes: string[]): string[] {
  if (!Array.isArray(v)) return [];
  const ok = new Set(existentes);
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && ok.has(x)))].sort();
}

// ============================================================
// EL APUNTE DE UN MES: LO QUE DEBÍA Y LO QUE PAGÓ
// ============================================================

/** Una fila de `monthly_payments` tal como llega de PostgREST. */
export type FilaPagoBD = {
  user_id?: string | null;
  period?: string | null;
  paid?: boolean | null;
  amount_eur?: number | string | null;
  due_eur?: number | string | null;
  due_manual?: boolean | null;
  paid_on?: string | null;
  note?: string | null;
};

/**
 * pagado: no le falta nada · parcial: ha pagado parte · debe: no ha pagado
 * nada · no_paga: ese mes la cuota es 0 € · sin_cuota: no se sabe cuánto debía.
 */
export type EstadoPago = 'pagado' | 'parcial' | 'debe' | 'no_paga' | 'sin_cuota';

export type Apunte = {
  /** Lo que tenía que pagar; `null` si no se sabe (regla 8). */
  debido: number | null;
  cobrado: number;
  /** Lo que falta: 0 si está pagado o si no se sabe lo que debía. */
  pendiente: number;
  estado: EstadoPago;
  /** La cuota de ese mes la puso el dueño a mano. */
  manual: boolean;
  pagadoEl: string | null;
  nota: string | null;
};

export function estadoDe(debido: number | null, cobrado: number): EstadoPago {
  if (debido === null) return cobrado > 0 ? 'pagado' : 'sin_cuota';
  if (debido <= 0) return cobrado > 0 ? 'pagado' : 'no_paga';
  if (cobrado >= debido - 0.005) return 'pagado';
  return cobrado > 0 ? 'parcial' : 'debe';
}

/** `paid` en la tabla: «de ese mes no debe nada». Lo leen Alumnos y el perfil del alumno. */
export const alDia = (e: EstadoPago): boolean => e === 'pagado' || e === 'no_paga';

export function leeApunte(f: FilaPagoBD | null | undefined, debidoSinFila: number | null = null): Apunte {
  if (!f) {
    return { debido: debidoSinFila, cobrado: 0, pendiente: debidoSinFila ?? 0, estado: estadoDe(debidoSinFila, 0), manual: false, pagadoEl: null, nota: null };
  }
  const debido = numONull(f.due_eur);
  const importe = numONull(f.amount_eur);
  // Una fila de antes de las cuotas («Pagó», sin importe): cobró lo que debía.
  const cobrado = importe ?? (f.paid === true && debido !== null ? debido : 0);
  const estado = f.paid === true && importe === null && debido === null ? 'pagado' : estadoDe(debido, cobrado);
  return {
    debido,
    cobrado: centimos(cobrado),
    pendiente: debido === null ? 0 : centimos(Math.max(debido - cobrado, 0)),
    estado,
    manual: f.due_manual === true,
    pagadoEl: typeof f.paid_on === 'string' ? f.paid_on.slice(0, 10) : null,
    nota: typeof f.note === 'string' && f.note.trim() ? f.note.trim() : null,
  };
}

/**
 * Cobrar: `cantidad` `null` es «lo que falta» (el botón de un toque); con
 * cantidad, se SUMA a lo cobrado (trae 30 y luego los 20 que faltan).
 */
export function aplicaCobro(
  actual: { debido: number | null; cobrado: number },
  cantidad: number | null,
): { ok: true; cobrado: number; estado: EstadoPago } | { ok: false; error: string } {
  if (cantidad === null) {
    if (actual.debido === null) return { ok: false, error: 'No tiene cuota calculada: escribe cuánto ha pagado.' };
    if (actual.debido <= 0) return { ok: false, error: 'Ese mes no tiene nada que pagar.' };
    const falta = centimos(Math.max(actual.debido - actual.cobrado, 0));
    if (falta <= 0) return { ok: false, error: 'Ese mes ya está pagado.' };
    const cobrado = centimos(actual.cobrado + falta);
    return { ok: true, cobrado, estado: estadoDe(actual.debido, cobrado) };
  }
  if (!(cantidad > 0)) return { ok: false, error: 'Escribe cuánto ha pagado.' };
  const cobrado = centimos(actual.cobrado + cantidad);
  if (cobrado > MAX_EUR) return { ok: false, error: 'El importe no es válido.' };
  return { ok: true, cobrado, estado: estadoDe(actual.debido, cobrado) };
}

// ============================================================
// ABRIR EL MES
// ============================================================

/**
 * Lo que hay que escribir para que el mes en curso tenga una fila por alumno
 * activo con su cuota: las que faltan, y las que no cuadran con la tarifa de
 * hoy SOLO si nadie las ha tocado (ni se ha cobrado nada ni la puso el dueño a
 * mano). Así el mes se va congelando solo: lo cobrado y lo puesto a mano no
 * se reescribe, y los meses pasados no se tocan nunca.
 */
export function cambiosParaAbrirMes(
  roster: { userId: string; importe: number | null }[],
  filasDelMes: FilaPagoBD[],
): { nuevas: { userId: string; due: number | null }[]; cambiar: { userId: string; due: number | null }[] } {
  const porAlumno = new Map<string, FilaPagoBD>();
  for (const f of filasDelMes) if (typeof f.user_id === 'string') porAlumno.set(f.user_id, f);
  const nuevas: { userId: string; due: number | null }[] = [];
  const cambiar: { userId: string; due: number | null }[] = [];
  for (const r of roster) {
    const f = porAlumno.get(r.userId);
    if (!f) { nuevas.push({ userId: r.userId, due: r.importe }); continue; }
    // Intacta: ni a mano ni nada cobrado. `paid` sin importe es un mes de 0 €
    // («no paga»), que también se pone al día si la tarifa cambia.
    const intacta = f.due_manual !== true && !(numONull(f.amount_eur) ?? 0) && (f.paid !== true || numONull(f.due_eur) === 0);
    if (intacta && !mismoImporte(numONull(f.due_eur), r.importe)) cambiar.push({ userId: r.userId, due: r.importe });
  }
  return { nuevas, cambiar };
}

// ============================================================
// EL MES
// ============================================================

export type AlumnoMes = Apunte & {
  userId: string;
  email: string | null;
  /** Tiene acceso hoy. Uno que ya no lo tiene sigue en los meses en que estuvo. */
  activo: boolean;
  /** La cuota que le sale HOY con la tarifa (para decir de dónde sale). */
  cuota: Cuota | null;
};

export type ResumenCuotasMes = {
  periodo: string;
  filas: AlumnoMes[];
  previsto: number;
  cobrado: number;
  pendiente: number;
  /** % de lo previsto ya cobrado; `null` si no hay nada previsto. */
  porcentaje: number | null;
  alumnos: number;
  pagados: number;
  parciales: number;
  deben: number;
  noPagan: number;
  sinCuota: number;
};

const ORDEN_ESTADO: Record<EstadoPago, number> = { debe: 0, parcial: 0, sin_cuota: 1, pagado: 2, no_paga: 3 };

export function porcentajeDe(cobrado: number, previsto: number): number | null {
  return previsto > 0 ? Math.min(100, Math.round((100 * cobrado) / previsto)) : null;
}

/**
 * El resumen de un mes. Cada alumno trae su fila del mes, o `null` si no la
 * tiene (el mes siguiente, que solo se prevé): entonces cuenta la cuota de hoy.
 */
export function resumeCuotasMes(
  periodo: string,
  alumnos: { userId: string; email: string | null; activo: boolean; cuota: Cuota | null; fila: FilaPagoBD | null }[],
): ResumenCuotasMes {
  const filas: AlumnoMes[] = alumnos.map((a) => ({
    ...leeApunte(a.fila, a.cuota?.importe ?? null),
    userId: a.userId,
    email: a.email,
    activo: a.activo,
    cuota: a.cuota,
  }));
  filas.sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || (a.email ?? '').localeCompare(b.email ?? '', 'es'));
  const previsto = centimos(filas.reduce((s, f) => s + (f.debido ?? 0), 0));
  const cobrado = centimos(filas.reduce((s, f) => s + f.cobrado, 0));
  const pendiente = centimos(filas.reduce((s, f) => s + f.pendiente, 0));
  const cuenta = (e: EstadoPago) => filas.filter((f) => f.estado === e).length;
  return {
    periodo,
    filas,
    previsto,
    cobrado,
    pendiente,
    porcentaje: porcentajeDe(cobrado, previsto),
    alumnos: filas.length,
    pagados: cuenta('pagado'),
    parciales: cuenta('parcial'),
    deben: cuenta('debe'),
    noPagan: cuenta('no_paga'),
    sinCuota: cuenta('sin_cuota'),
  };
}

// ============================================================
// EL HISTÓRICO Y QUIÉN DEBE
// ============================================================

export type CeldaCuota = Pick<Apunte, 'debido' | 'cobrado' | 'pendiente' | 'estado' | 'manual' | 'nota' | 'pagadoEl'>;

export type AlumnoHistorico = {
  userId: string;
  email: string | null;
  activo: boolean;
  /** `periodo` → su apunte. Un mes en que no estaba NO está en el mapa. */
  celdas: Record<string, CeldaCuota>;
  /** Lo que debe de los meses ya cerrados (antes del mes en curso). */
  deudaAnterior: number;
  mesesDebe: string[];
  /** Lo que le falta del mes en curso. */
  pendienteActual: number;
  cobradoTotal: number;
};

export type MesHistorico = {
  periodo: string;
  previsto: number;
  cobrado: number;
  pendiente: number;
  porcentaje: number | null;
  alumnos: number;
  pagados: number;
};

export type HistoricoCuotas = {
  periodos: string[];
  actual: string;
  meses: MesHistorico[];
  alumnos: AlumnoHistorico[];
  totales: { previsto: number; cobrado: number; pendiente: number; porcentaje: number | null; deudaAnterior: number };
  /** Los que deben meses ya cerrados, de más a menos deuda. */
  deudores: AlumnoHistorico[];
};

/**
 * Todos los meses a la vez. `periodos` en orden cronológico; `actual` es el
 * mes en curso: lo que falta de él es «pendiente», no «deuda» todavía.
 * Entra cada alumno con alguna fila en el rango, y los activos aunque no la
 * tengan (salen en blanco).
 */
export function resumeHistoricoCuotas(
  periodos: string[],
  actual: string,
  personas: { userId: string; email: string | null; activo: boolean }[],
  filas: FilaPagoBD[],
): HistoricoCuotas {
  const enRango = new Set(periodos);
  const porAlumno = new Map<string, Record<string, CeldaCuota>>();
  for (const f of filas) {
    if (typeof f.user_id !== 'string' || typeof f.period !== 'string' || !enRango.has(f.period)) continue;
    const { debido, cobrado, pendiente, estado, manual, nota, pagadoEl } = leeApunte(f);
    const c = porAlumno.get(f.user_id) ?? {};
    c[f.period] = { debido, cobrado, pendiente, estado, manual, nota, pagadoEl };
    porAlumno.set(f.user_id, c);
  }
  const datos = new Map(personas.map((p) => [p.userId, p]));
  const ids = new Set<string>([...porAlumno.keys(), ...personas.filter((p) => p.activo).map((p) => p.userId)]);

  const alumnos: AlumnoHistorico[] = [...ids].map((id) => {
    const celdas = porAlumno.get(id) ?? {};
    const mesesDebe = periodos.filter((p) => p < actual && (celdas[p]?.pendiente ?? 0) > 0);
    return {
      userId: id,
      email: datos.get(id)?.email ?? null,
      activo: datos.get(id)?.activo ?? false,
      celdas,
      deudaAnterior: centimos(mesesDebe.reduce((s, p) => s + celdas[p].pendiente, 0)),
      mesesDebe,
      pendienteActual: celdas[actual]?.pendiente ?? 0,
      cobradoTotal: centimos(Object.values(celdas).reduce((s, c) => s + c.cobrado, 0)),
    };
  });
  alumnos.sort((a, b) => (a.email ?? '').localeCompare(b.email ?? '', 'es'));

  const meses: MesHistorico[] = periodos.map((periodo) => {
    const cs = alumnos.map((a) => a.celdas[periodo]).filter((c): c is CeldaCuota => !!c);
    const previsto = centimos(cs.reduce((s, c) => s + (c.debido ?? 0), 0));
    const cobrado = centimos(cs.reduce((s, c) => s + c.cobrado, 0));
    return {
      periodo,
      previsto,
      cobrado,
      pendiente: centimos(cs.reduce((s, c) => s + c.pendiente, 0)),
      porcentaje: porcentajeDe(cobrado, previsto),
      alumnos: cs.length,
      pagados: cs.filter((c) => alDia(c.estado)).length,
    };
  });

  const previsto = centimos(meses.reduce((s, m) => s + m.previsto, 0));
  const cobrado = centimos(meses.reduce((s, m) => s + m.cobrado, 0));
  return {
    periodos,
    actual,
    meses,
    alumnos,
    totales: {
      previsto,
      cobrado,
      pendiente: centimos(meses.reduce((s, m) => s + m.pendiente, 0)),
      porcentaje: porcentajeDe(cobrado, previsto),
      deudaAnterior: centimos(alumnos.reduce((s, a) => s + a.deudaAnterior, 0)),
    },
    deudores: alumnos.filter((a) => a.deudaAnterior > 0).sort((a, b) => b.deudaAnterior - a.deudaAnterior || (a.email ?? '').localeCompare(b.email ?? '', 'es')),
  };
}

// ============================================================
// LOS MESES
// ============================================================

/** El mes en curso en la hora de la academia (no en la del servidor). */
export function periodoEnZona(ms: number = Date.now()): string {
  return ahoraEnZona(ms).fecha.slice(0, 7);
}

export function esPeriodo(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** `2026-11` + 1 → `2026-12`; + 2 → `2027-01`. */
export function sumaMeses(periodo: string, n: number): string {
  const [y, m] = periodo.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Los `n` meses que acaban en `ultimo`, en orden cronológico. */
export function mesesHasta(ultimo: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => sumaMeses(ultimo, i - n + 1));
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-11` → «nov» (y «nov 26» si `conAno`). */
export function mesCorto(periodo: string, conAno = false): string {
  const [y, m] = periodo.split('-');
  const txt = MESES_CORTOS[Number(m) - 1] ?? m;
  return conAno ? `${txt} ${y.slice(2)}` : txt;
}

// ============================================================
// EXPORTAR
// ============================================================

const ETIQUETA_ESTADO: Record<EstadoPago, string> = {
  pagado: 'Pagado',
  parcial: 'A medias',
  debe: 'Debe',
  no_paga: 'No paga',
  sin_cuota: 'Sin cuota',
};
export const etiquetaEstado = (e: EstadoPago) => ETIQUETA_ESTADO[e];

/**
 * Una celda de CSV a salvo: entre comillas si lleva `;`, comillas o saltos, y
 * con una comilla delante si empieza por `=`, `+`, `-`, `@` (o tabulador):
 * un correo o una nota no pueden convertirse en una fórmula al abrir el
 * fichero en Excel.
 */
export function celdaCsv(s: string): string {
  const t = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

const numCsv = (x: number | null) => (x === null ? '' : x.toFixed(2).replace('.', ','));

/**
 * El histórico en CSV para la hoja de cálculo: una fila por alumno y mes, con
 * `;` y la coma decimal (lo que abre bien un Excel en español), y el BOM para
 * que los acentos salgan.
 */
export function csvHistorico(h: HistoricoCuotas): string {
  const lineas = ['Alumno;Mes;Cuota;Cobrado;Pendiente;Estado;Pagado el;Nota'];
  for (const a of h.alumnos) {
    for (const p of h.periodos) {
      const c = a.celdas[p];
      if (!c) continue;
      lineas.push([celdaCsv(a.email ?? a.userId), p, numCsv(c.debido), numCsv(c.cobrado), numCsv(c.pendiente), ETIQUETA_ESTADO[c.estado], c.pagadoEl ?? '', celdaCsv(c.nota ?? '')].join(';'));
    }
  }
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}

// ============================================================
// EL LIBRO DE COBROS: RECIBOS, MÉTODO Y CAJA
// ============================================================

export const METODOS_PAGO = ['efectivo', 'bizum', 'transferencia', 'tarjeta'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];
export const ETIQUETA_METODO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  bizum: 'Bizum',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
};
export const esMetodo = (v: unknown): v is MetodoPago => typeof v === 'string' && (METODOS_PAGO as readonly string[]).includes(v);

/** Una fila de `payment_entries` tal como llega de PostgREST. */
export type CobroBD = {
  id?: string | null;
  user_id?: string | null;
  alumno?: string | null;
  period?: string | null;
  amount_eur?: number | string | null;
  method?: string | null;
  receipt_no?: number | null;
  paid_on?: string | null;
  voided_at?: string | null;
};

/** Un cobro: un recibo. Anulado sigue existiendo (con su número), pero no suma. */
export type Cobro = {
  id: string;
  userId: string | null;
  alumno: string;
  periodo: string;
  importe: number;
  metodo: MetodoPago;
  recibo: number;
  fecha: string;
  anulado: boolean;
};

export function leeCobro(c: CobroBD): Cobro | null {
  const importe = numONull(c.amount_eur);
  if (typeof c.id !== 'string' || typeof c.period !== 'string' || typeof c.paid_on !== 'string' || importe === null || typeof c.receipt_no !== 'number') return null;
  return {
    id: c.id,
    userId: typeof c.user_id === 'string' ? c.user_id : null,
    alumno: typeof c.alumno === 'string' ? c.alumno : '',
    periodo: c.period,
    importe: centimos(importe),
    metodo: esMetodo(c.method) ? c.method : 'efectivo',
    recibo: c.receipt_no,
    fecha: c.paid_on.slice(0, 10),
    anulado: typeof c.voided_at === 'string' && c.voided_at.length > 0,
  };
}

/**
 * Lo cobrado de cada (alumno, mes) según el libro: la suma de sus cobros no
 * anulados. Solo trae los meses que tienen algún cobro, anulado o no: un mes
 * sin ninguno se queda con lo que diga su fila (de antes del libro).
 */
export function cobradoSegunLibro(cobros: Cobro[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cobros) {
    if (!c.userId) continue;
    const k = `${c.userId} ${c.periodo}`;
    m.set(k, centimos((m.get(k) ?? 0) + (c.anulado ? 0 : c.importe)));
  }
  return m;
}

/** La fila del mes con lo cobrado según el libro (que manda sobre el resumen guardado). */
export function filaSegunLibro(f: FilaPagoBD, cobrado: number | undefined): FilaPagoBD {
  if (cobrado === undefined) return f;
  const debido = numONull(f.due_eur);
  return { ...f, amount_eur: cobrado > 0 ? cobrado : null, paid: alDia(estadoDe(debido, cobrado)) };
}

export type TotalMetodo = { metodo: MetodoPago; importe: number; cobros: number };

export type CajaDia = { fecha: string; importe: number; cobros: number };

export type Caja = {
  /** El mes de la caja (por la FECHA del cobro, no por el mes que paga). */
  mes: string;
  /** Todos los cobros con fecha en ese mes, anulados incluidos, del más reciente al más antiguo. */
  lineas: Cobro[];
  total: number;
  cobros: number;
  anulados: number;
  porMetodo: TotalMetodo[];
  porDia: CajaDia[];
};

/**
 * El cierre de caja de un mes: lo que ENTRÓ en ese mes, por fecha de cobro.
 * Un cobro anulado sale (el gestor ve su número) pero no suma.
 */
export function cajaDelMes(mes: string, cobros: Cobro[]): Caja {
  const lineas = cobros
    .filter((c) => c.fecha.startsWith(mes))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.recibo - a.recibo);
  const validos = lineas.filter((c) => !c.anulado);
  const porMetodo = METODOS_PAGO
    .map((metodo) => {
      const xs = validos.filter((c) => c.metodo === metodo);
      return { metodo, importe: centimos(xs.reduce((s, c) => s + c.importe, 0)), cobros: xs.length };
    })
    .filter((t) => t.cobros > 0);
  const dias = new Map<string, CajaDia>();
  for (const c of validos) {
    const d = dias.get(c.fecha) ?? { fecha: c.fecha, importe: 0, cobros: 0 };
    d.importe = centimos(d.importe + c.importe);
    d.cobros++;
    dias.set(c.fecha, d);
  }
  return {
    mes,
    lineas,
    total: centimos(validos.reduce((s, c) => s + c.importe, 0)),
    cobros: validos.length,
    anulados: lineas.length - validos.length,
    porMetodo,
    porDia: [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** `2026-11` → «noviembre de 2026». */
export const mesEnTexto = (p: string) => `${MESES_LARGOS[Number(p.slice(5, 7)) - 1] ?? p.slice(5, 7)} de ${p.slice(0, 4)}`;
/** `2026-11-03` → «03/11/2026». */
export const fechaEnTexto = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

/** La caja en CSV para el gestor: un cobro por fila, los anulados marcados y sin sumar. */
export function csvCaja(caja: Caja): string {
  const lineas = ['Recibo;Fecha;Alumno;Concepto;Método;Importe;Estado'];
  for (const c of [...caja.lineas].sort((a, b) => a.recibo - b.recibo)) {
    lineas.push([
      String(c.recibo),
      fechaEnTexto(c.fecha),
      celdaCsv(c.alumno),
      celdaCsv(`Mensualidad de ${mesEnTexto(c.periodo)}`),
      ETIQUETA_METODO[c.metodo],
      numCsv(c.importe),
      c.anulado ? 'Anulado' : 'Cobrado',
    ].join(';'));
  }
  lineas.push(['', '', '', '', 'Total', numCsv(caja.total), ''].join(';'));
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}

const escapaHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * El recibo de un cobro, para imprimir o guardar en PDF desde el navegador
 * (el justificante que piden los alumnos o sus padres). Todo lo que viene de
 * la base de datos se escapa: un correo no puede meter HTML.
 */
export function htmlRecibo(c: Cobro, academia: string): string {
  const e = escapaHtml;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo ${c.recibo} · ${e(academia)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;margin:0;padding:32px;background:#fff}
.r{max-width:560px;margin:0 auto;border:1px solid #cbd5e1;border-radius:8px;padding:28px}
h1{font-size:20px;margin:0 0 4px;letter-spacing:.04em;text-transform:uppercase}
.n{color:#475569;font-size:14px;margin:0 0 24px}
table{width:100%;border-collapse:collapse;font-size:15px}
td{padding:8px 0;border-bottom:1px solid #e2e8f0;vertical-align:top}
td:first-child{color:#475569;width:38%}
.t td{border:0;padding-top:16px;font-size:20px;font-weight:700}
.a{margin-top:24px;color:#b91c1c;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.p{margin-top:28px;font-size:12px;color:#64748b}
@media print{body{padding:0}.r{border:0}}
</style></head><body><div class="r">
<h1>${e(academia)}</h1><p class="n">Recibo nº ${c.recibo}</p>
<table>
<tr><td>Fecha</td><td>${fechaEnTexto(c.fecha)}</td></tr>
<tr><td>Alumno</td><td>${e(c.alumno)}</td></tr>
<tr><td>Concepto</td><td>Mensualidad de ${e(mesEnTexto(c.periodo))}</td></tr>
<tr><td>Forma de pago</td><td>${ETIQUETA_METODO[c.metodo]}</td></tr>
<tr class="t"><td>Importe</td><td>${eur(c.importe)}</td></tr>
</table>
${c.anulado ? '<p class="a">Anulado</p>' : ''}
<p class="p">Recibí la cantidad indicada en concepto de la mensualidad señalada.</p>
</div><script>window.onload=function(){window.print()}</script></body></html>`;
}
