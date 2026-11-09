/**
 * EL CUADRANTE SEMANAL DE FÍSICA (regla 96).
 *
 * Alphapol manda cada semana una imagen con lo que toca a cada grupo cada día
 * y qué profesor lo da, según quién esté disponible. Aquí se monta esa misma
 * rejilla desde las sesiones (`training_sessions`) de los grupos: una sesión
 * por grupo y día, con su profesor (`teacher_id`) y, si no es la del grupo, su
 * hora propia (`start_time`: la de Multi a las 18:30).
 *
 * Los alumnos MULTIDISCIPLINARES (`is_multi`) no tienen grupo propio: cada
 * semana se apuntan a las sesiones de otros grupos y ocupan plaza en ellas.
 *
 * SOLO LLEVA CLASES DE GRUPO (regla 97): entran los grupos con horario semanal
 * y los de Multi. Un grupo sin horario (el «Promo 43 · Físicas» de ejemplo, un
 * plan común) no sale nunca, tenga las sesiones que tenga. Y un día solo
 * existe si algún grupo tiene clase ese día o si hay sesión de Multi: la fila
 * de Multi no crea días. Un día (o un grupo un día) se puede marcar «sin
 * clase» (`class_days_off`) sin tocar el horario fijo.
 *
 * Módulo PURO (regla 21): lo comparten el panel, la imagen que se descarga, el
 * texto de WhatsApp y las acciones. Las fechas son `YYYY-MM-DD` en la hora de
 * la academia (regla 82).
 */

import { DIAS_SEMANA, diaSemanaDe, horaCorta, sumaDias, cuentaSesion, leeHora, type HorarioGrupo, type CuentaSesion } from './asistencia.ts';
import { MAX_TITULO, diasDeSemana, type TipoSesion } from './sesiones.ts';

/** Lo que dura una sesión si no se dice otra cosa (la física de Alphapol es de una hora). */
export const DURACION_SESION_MIN = 60;
/** Quien entra antes de esta hora es del turno de mañana. */
const HORA_CORTE_TARDE = 14 * 60;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// ============================================================
// TIPOS
// ============================================================

export type GrupoCuadrante = {
  id: string;
  nombre: string;
  /** «Kappa»: el nombre sin «Promo 44 ·». Es lo que se ve en el cuadrante. */
  corto: string;
  esMulti: boolean;
  horario: HorarioGrupo;
  /** Cuántos alumnos tiene el grupo. */
  inscritos: number;
};

export type Profesor = { id: string; nombre: string };

export type SesionCuadrante = {
  id: string;
  classId: string;
  fecha: string;
  titulo: string;
  tipo: TipoSesion;
  profesorId: string | null;
  /** Hora propia de esta sesión; `null` = la del grupo. */
  horaPropia: string | null;
  position: number;
};

export type TurnoId = 'manana' | 'tarde';

export type FilaCuadrante = {
  grupo: GrupoCuadrante;
  /** La primera sesión del grupo ese día, o `null` si no tiene (celda vacía). */
  sesion: SesionCuadrante | null;
  /** Cuántas sesiones más tiene ese día (se cambian desde el planificador). */
  extras: number;
  profesor: Profesor | null;
  /** `HH:MM`: la propia de la sesión o, si no, la del grupo. */
  hora: string | null;
  /** Hora que se rotula en la celda: solo si NO es la del grupo (Multi, 18:30). */
  horaRotulada: string | null;
  /** Sesión de un grupo con horario en un día que no es el suyo (una clase extra). */
  extra: boolean;
  /** Lo que avisa el sistema (profesor en dos sitios a la vez). */
  avisos: string[];
};

export type DiaCuadrante = {
  fecha: string;
  titulo: string;
  filas: FilaCuadrante[];
  /** Ningún grupo tiene ese día en su horario: existe solo por sesiones sueltas (Multi, un día añadido). */
  suelto: boolean;
};

/** Una marca «sin clase» (`class_days_off`): ese grupo, ese día, no tiene clase. */
export type DiaSinClase = { classId: string; fecha: string; motivo: string | null };

/** Lo quitado de una semana, por día: lo que se puede devolver. */
export type QuitadoCuadrante = {
  fecha: string;
  titulo: string;
  grupos: GrupoCuadrante[];
  /** Los motivos distintos que se escribieron (festivo, sin profesor…). */
  motivos: string[];
  /** Todos los grupos que tenían clase ese día están quitados: el día entero. */
  todos: boolean;
};

export type TurnoCuadrante = { id: TurnoId; hora: string | null; grupos: string[] };

export type Cuadrante = {
  lunes: string;
  rango: string;
  dias: DiaCuadrante[];
  turnos: TurnoCuadrante[];
  /** Lo marcado «sin clase» esa semana. No sale en la rejilla, ni en la imagen, ni en el texto. */
  quitados: QuitadoCuadrante[];
};

// ============================================================
// NOMBRES, TURNOS Y COLORES
// ============================================================

/** «Promo 44 · Kappa» -> «Kappa». Sin « · » se queda el nombre entero. */
export function nombreCorto(nombre: string): string {
  const i = nombre.lastIndexOf('·');
  return (i >= 0 ? nombre.slice(i + 1) : nombre).trim() || nombre.trim();
}

/** «José Morato» -> «José»: así lo escribe el preparador en el cuadrante. */
export const nombrePila = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

const minutosDe = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function turnoDe(horaInicio: string | null): TurnoId | null {
  const h = horaCorta(horaInicio);
  if (!h) return null;
  return minutosDe(h) < HORA_CORTE_TARDE ? 'manana' : 'tarde';
}

export const ETIQUETA_TURNO: Record<TurnoId, string> = { manana: 'Turno de mañana', tarde: 'Turno de tarde' };

/**
 * Los colores del cuadrante que ya conocen los alumnos (el de la imagen que
 * manda Alphapol). Por el nombre CORTO del grupo, sin acentos ni mayúsculas;
 * un grupo nuevo sin color sale en el marino de la marca.
 */
export const COLOR_GRUPO: Record<string, { fondo: string; texto: string }> = {
  kappa: { fondo: '#7c3aed', texto: '#ffffff' },
  alpha: { fondo: '#dc2626', texto: '#ffffff' },
  omega: { fondo: '#dc2626', texto: '#ffffff' },
  zetta: { fondo: '#0d9488', texto: '#ffffff' },
  sigma: { fondo: '#db2777', texto: '#ffffff' },
  betta: { fondo: '#eab308', texto: '#ffffff' },
  delta: { fondo: '#16a34a', texto: '#ffffff' },
  multi: { fondo: '#14295a', texto: '#ffffff' },
};
const COLOR_DEFECTO = { fondo: '#14295a', texto: '#ffffff' };

export function colorDeGrupo(corto: string): { fondo: string; texto: string } {
  const clave = corto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return COLOR_GRUPO[clave] ?? COLOR_DEFECTO;
}

// ============================================================
// FECHAS
// ============================================================

const dia = (fecha: string) => Number(fecha.slice(8, 10));
const mes = (fecha: string) => MESES[Number(fecha.slice(5, 7)) - 1];

/** «del 9 al 12 de noviembre» · «del 30 de noviembre al 3 de diciembre». */
export function etiquetaRango(desde: string, hasta: string): string {
  if (desde === hasta) return `el ${dia(desde)} de ${mes(desde)}`;
  if (desde.slice(0, 7) === hasta.slice(0, 7)) return `del ${dia(desde)} al ${dia(hasta)} de ${mes(hasta)}`;
  return `del ${dia(desde)} de ${mes(desde)} al ${dia(hasta)} de ${mes(hasta)}`;
}

/** «LUNES 9». */
export function tituloDia(fecha: string): string {
  return `${DIAS_SEMANA[diaSemanaDe(fecha) - 1].largo.toUpperCase()} ${dia(fecha)}`;
}

/** La hora de clase de un grupo, `HH:MM`, o `null` si no tiene (Multi). */
export const horaCortaGrupo = (g: Pick<GrupoCuadrante, 'horario'>) => horaCorta(g.horario.startTime);

/** Los días de la semana en que un grupo tiene clase, como fechas. */
export function fechasDelGrupo(grupo: GrupoCuadrante, lunes: string): string[] {
  return (grupo.horario.weekdays ?? []).map((n) => sumaDias(lunes, n - 1));
}

// ============================================================
// LA REJILLA
// ============================================================

/**
 * Multi al final y, por lo demás, por hora de inicio. A igual hora se respeta
 * el orden en que vienen los grupos (el de su alta: Kappa, Alpha, Zetta…, que
 * es el del cuadrante que ya conocen los alumnos, no el alfabético). `sort` es
 * estable, así que devolver 0 mantiene ese orden.
 */
function ordenGrupos(a: GrupoCuadrante, b: GrupoCuadrante): number {
  if (a.esMulti !== b.esMulti) return a.esMulti ? 1 : -1;
  return (a.horario.startTime ?? '99').localeCompare(b.horario.startTime ?? '99');
}

/**
 * ¿Sale el grupo en el cuadrante? Solo las CLASES DE GRUPO: los grupos con
 * horario semanal y los de Multi. Un grupo sin días (un plan común, como el
 * «Promo 43 · Físicas» de ejemplo) no sale nunca, tenga las sesiones que tenga:
 * eso ya no es una clase, es un plan, y el entreno de cada alumno es suyo.
 */
export function entraEnCuadrante(g: Pick<GrupoCuadrante, 'esMulti' | 'horario'>): boolean {
  return g.esMulti || !!g.horario.weekdays?.length;
}

const claveDia = (classId: string, fecha: string) => `${classId}|${fecha}`;

/**
 * Los días que salen en el cuadrante: los días de clase de los grupos con
 * horario y los días con alguna sesión de un grupo del cuadrante (la de Multi
 * de las 18:30, o un día añadido a mano, como un sábado: regla 99). La fila de
 * Multi NO crea días por sí sola, ni una sesión de un grupo sin horario (no
 * entra en el cuadrante). Lo marcado «sin clase» no cuenta: un día con todos
 * sus grupos quitados desaparece.
 */
export function fechasDelCuadrante(
  grupos: GrupoCuadrante[],
  sesiones: SesionCuadrante[],
  lunes: string,
  sinClase: DiaSinClase[] = [],
): string[] {
  const off = new Set(sinClase.map((x) => claveDia(x.classId, x.fecha)));
  const fin = sumaDias(lunes, 6);
  const set = new Set<string>();
  for (const g of grupos) {
    if (g.esMulti || !entraEnCuadrante(g)) continue;
    for (const f of fechasDelGrupo(g, lunes)) if (!off.has(claveDia(g.id, f))) set.add(f);
  }
  const delCuadrante = new Set(grupos.filter(entraEnCuadrante).map((g) => g.id));
  for (const s of sesiones) {
    if (delCuadrante.has(s.classId) && s.fecha >= lunes && s.fecha <= fin && !off.has(claveDia(s.classId, s.fecha))) set.add(s.fecha);
  }
  return [...set].sort();
}

type Intervalo = { id: string; profesorId: string; fecha: string; ini: number; fin: number; donde: string };

/**
 * Un profesor no puede estar en dos sitios a la vez. Devuelve, por id de
 * sesión, lo que hay que avisar. Solo compara sesiones con hora conocida: sin
 * hora no se sabe si chocan, y avisar sin saberlo sería ruido.
 */
export function choquesDeProfesor(
  sesiones: SesionCuadrante[],
  grupos: GrupoCuadrante[],
  profesores: Profesor[],
): Map<string, string[]> {
  const porGrupo = new Map(grupos.map((g) => [g.id, g]));
  const nombre = new Map(profesores.map((p) => [p.id, nombrePila(p.nombre)]));
  const tramos: Intervalo[] = [];
  for (const s of sesiones) {
    const g = porGrupo.get(s.classId);
    const h = horaCorta(s.horaPropia ?? g?.horario.startTime ?? null);
    if (!s.profesorId || !g || !h) continue;
    const ini = minutosDe(h);
    tramos.push({ id: s.id, profesorId: s.profesorId, fecha: s.fecha, ini, fin: ini + DURACION_SESION_MIN, donde: g.corto });
  }
  const avisos = new Map<string, string[]>();
  for (let i = 0; i < tramos.length; i++) {
    for (let j = i + 1; j < tramos.length; j++) {
      const a = tramos[i];
      const b = tramos[j];
      if (a.profesorId !== b.profesorId || a.fecha !== b.fecha || a.ini >= b.fin || b.ini >= a.fin) continue;
      const quien = nombre.get(a.profesorId) ?? 'El profesor';
      avisos.set(a.id, [...(avisos.get(a.id) ?? []), `${quien} también está con ${b.donde} a esa hora.`]);
      avisos.set(b.id, [...(avisos.get(b.id) ?? []), `${quien} también está con ${a.donde} a esa hora.`]);
    }
  }
  return avisos;
}

/** Arma el cuadrante de una semana: lo que ve el panel, la imagen y el texto. */
export function armaCuadrante(params: {
  lunes: string;
  grupos: GrupoCuadrante[];
  sesiones: SesionCuadrante[];
  profesores: Profesor[];
  sinClase?: DiaSinClase[];
}): Cuadrante {
  const { lunes, profesores } = params;
  const fin = sumaDias(lunes, 6);
  const grupos = params.grupos.filter(entraEnCuadrante);
  const ids = new Set(grupos.map((g) => g.id));
  const off = new Map((params.sinClase ?? [])
    .filter((x) => ids.has(x.classId) && x.fecha >= lunes && x.fecha <= fin)
    .map((x) => [claveDia(x.classId, x.fecha), x]));
  const sinClase = [...off.values()];
  // Lo de un grupo que no sale, o lo de un día quitado, no pinta nada: ni
  // celda, ni choques de profesor.
  const sesiones = params.sesiones
    .filter((s) => ids.has(s.classId) && s.fecha >= lunes && s.fecha <= fin && !off.has(claveDia(s.classId, s.fecha)))
    .sort((a, b) => a.position - b.position || a.titulo.localeCompare(b.titulo, 'es'));
  const orden = [...grupos].sort(ordenGrupos);
  const prof = new Map(profesores.map((p) => [p.id, p]));
  const choques = choquesDeProfesor(sesiones, grupos, profesores);
  const programados = (fecha: string) => orden.filter((g) => !g.esMulti && fechasDelGrupo(g, lunes).includes(fecha));

  const dias: DiaCuadrante[] = fechasDelCuadrante(grupos, sesiones, lunes, sinClase).map((fecha) => {
    const filas: FilaCuadrante[] = [];
    for (const g of orden) {
      if (off.has(claveDia(g.id, fecha))) continue;
      const delDia = sesiones.filter((s) => s.classId === g.id && s.fecha === fecha);
      const diaDeClase = !g.esMulti && fechasDelGrupo(g, lunes).includes(fecha);
      // Multi sale en todos los días (es la celda de abajo, a veces vacía); el
      // resto, si tiene clase ese día o una clase extra.
      if (!g.esMulti && !diaDeClase && !delDia.length) continue;
      const sesion = delDia[0] ?? null;
      const hora = horaCorta(sesion?.horaPropia ?? g.horario.startTime ?? null);
      filas.push({
        grupo: g,
        sesion,
        extras: Math.max(0, delDia.length - 1),
        profesor: sesion?.profesorId ? prof.get(sesion.profesorId) ?? null : null,
        hora,
        horaRotulada: sesion?.horaPropia && sesion.horaPropia !== g.horario.startTime ? sesion.horaPropia : null,
        extra: !g.esMulti && !diaDeClase,
        avisos: sesion ? choques.get(sesion.id) ?? [] : [],
      });
    }
    return { fecha, titulo: tituloDia(fecha), filas, suelto: programados(fecha).length === 0 };
  });

  const quitados: QuitadoCuadrante[] = [...new Set(sinClase.map((x) => x.fecha))].sort().map((fecha) => {
    const delDia = sinClase.filter((x) => x.fecha === fecha);
    const quitadosIds = new Set(delDia.map((x) => x.classId));
    const prog = programados(fecha);
    return {
      fecha,
      titulo: tituloDia(fecha),
      grupos: orden.filter((g) => quitadosIds.has(g.id)),
      motivos: [...new Set(delDia.map((x) => x.motivo?.trim()).filter((m): m is string => !!m))],
      todos: prog.length > 0 && prog.every((g) => quitadosIds.has(g.id)),
    };
  });

  const turnos: TurnoCuadrante[] = [];
  for (const id of ['manana', 'tarde'] as const) {
    const delTurno = orden.filter((g) => !g.esMulti && turnoDe(g.horario.startTime) === id);
    if (!delTurno.length) continue;
    turnos.push({ id, hora: delTurno[0].horario.startTime, grupos: delTurno.map((g) => g.corto) });
  }

  const fechas = dias.map((d) => d.fecha);
  return {
    lunes,
    rango: fechas.length ? etiquetaRango(fechas[0], fechas[fechas.length - 1]) : etiquetaRango(lunes, fin),
    dias,
    turnos,
    quitados,
  };
}

// ============================================================
// EL TEXTO PARA WHATSAPP
// ============================================================

/**
 * El cuadrante como texto, para pegarlo en WhatsApp (negritas con `*`). Es lo
 * que hoy se manda junto a la imagen. Las celdas vacías no salen.
 */
export function textoCuadrante(c: Cuadrante, nombreAcademia = 'ALPHAPOL'): string {
  const lineas: string[] = [`📣 *CUADRANTE SEMANAL ${nombreAcademia}* · ${c.rango}`, ''];
  for (const t of c.turnos) {
    const icono = t.id === 'manana' ? '☀️' : '🌙';
    lineas.push(`${icono} ${ETIQUETA_TURNO[t.id]}${t.hora ? ` ${t.hora}` : ''}: ${t.grupos.map((g) => g.toUpperCase()).join(', ')}`);
  }
  if (c.turnos.length) lineas.push('');
  for (const d of c.dias) {
    const filas = d.filas.filter((f) => f.sesion);
    if (!filas.length) continue;
    lineas.push(`*${d.titulo}*`);
    for (const f of filas) {
      const quien = f.profesor ? ` (${nombrePila(f.profesor.nombre)})` : '';
      const hora = f.horaRotulada ? ` · ${f.horaRotulada} h` : '';
      lineas.push(`• ${f.grupo.corto.toUpperCase()} — ${f.sesion!.titulo}${hora}${quien}`);
    }
    lineas.push('');
  }
  lineas.push('¡A por ello! 💪');
  return lineas.join('\n');
}

// ============================================================
// LO QUE ENTRA DE LA PANTALLA
// ============================================================

export type CeldaEntrada = {
  titulo: string;
  profesorId: string | null;
  horaPropia: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `leeHora` vive en `asistencia.ts` (la usan también los horarios de los
// grupos, regla 99); se reexporta aquí, donde nació.
export { leeHora } from './asistencia.ts';

/** Valida lo que llega de una celda del cuadrante (regla 27: igual que lo que escribe la IA). */
export function normalizaCelda(raw: Record<string, unknown> | null | undefined):
  { ok: true; valor: CeldaEntrada } | { ok: false; error: string } {
  const r = raw ?? {};
  const titulo = typeof r.titulo === 'string' ? r.titulo.replace(/\0/g, '').trim() : '';
  if (!titulo) return { ok: false, error: 'Escribe qué toca (por ejemplo, FLK 5.0).' };
  if (titulo.length > MAX_TITULO) return { ok: false, error: `El título admite hasta ${MAX_TITULO} caracteres.` };
  const profesorId = r.profesorId === undefined || r.profesorId === null || r.profesorId === '' ? null : r.profesorId;
  if (profesorId !== null && !(typeof profesorId === 'string' && UUID.test(profesorId))) {
    return { ok: false, error: 'Ese profesor no es válido.' };
  }
  const vacia = r.horaPropia === undefined || r.horaPropia === null || (typeof r.horaPropia === 'string' && r.horaPropia.trim() === '');
  const horaPropia = vacia ? null : leeHora(r.horaPropia);
  if (!vacia && !horaPropia) return { ok: false, error: 'La hora tiene que ser como 18:30.' };
  return { ok: true, valor: { titulo, profesorId, horaPropia } };
}

// ============================================================
// EL TIPO, DEDUCIDO DEL TÍTULO
// ============================================================

/**
 * El tipo de la sesión (que da el color en el calendario del alumno) sale del
 * título cuando es evidente: el preparador escribe «Rodaje 40′» o «Circuito»,
 * no elige «Carrera» en un desplegable (regla 97). Lo que no se reconoce
 * («Boxeo», «Jiujitsu», «FLK 5.0») es `otro`: mejor un gris que un color
 * equivocado. El orden importa: «Circuito de agilidad» es agilidad, y
 * «Circuito de fuerza» es circuito.
 */
const REGLAS_TIPO: [TipoSesion, RegExp][] = [
  ['descanso', /\b(descanso|dia libre)\b/],
  ['movilidad', /\b(movilidad|estiramientos?|flexibilidad|yoga|pilates|recuperacion|foam)\b/],
  ['agilidad', /\bagilidad\b/],
  ['carrera', /\b(carrera|correr|rodajes?|fartlek|trote|cuestas|1\.?000|\d+ ?(m|km))\b/],
  ['circuito', /\b(circuitos?|hiit|wod|crossfit|tabata|emom|amrap)\b/],
  ['fuerza', /(\bfuerza\b|\bf\.m\b|\bfm\b|\brdl\b|\bdominadas?\b|\bpesas\b|\bsentadillas?\b|\bpress\b|\bpeso muerto\b|\bgimnasio\b|\bgym\b|\bpotencia\b|\bsuspension\b)/],
];

export function tipoDeTitulo(titulo: string): TipoSesion {
  const t = titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const [tipo, re] of REGLAS_TIPO) if (re.test(t)) return tipo;
  return 'otro';
}

/**
 * Los títulos ya usados, del más repetido al menos: son las sugerencias del
 * editor de celda, para no escribir «F.M + RDL» de cero cada semana.
 */
export function titulosFrecuentes(titulos: string[], max = 24): string[] {
  const n = new Map<string, { titulo: string; veces: number }>();
  for (const t of titulos) {
    const limpio = t.trim();
    if (!limpio) continue;
    const k = limpio.toLowerCase();
    const x = n.get(k) ?? { titulo: limpio, veces: 0 };
    x.veces += 1;
    n.set(k, x);
  }
  return [...n.values()]
    .sort((a, b) => b.veces - a.veces || a.titulo.localeCompare(b.titulo, 'es'))
    .slice(0, max)
    .map((x) => x.titulo);
}

/** El motivo de un día sin clase: texto corto, vacío es `null` (regla 16). */
export const MAX_MOTIVO = 120;
export function normalizaMotivo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\0/g, '').trim().slice(0, MAX_MOTIVO);
  return t || null;
}

// ============================================================
// PLAZAS CON MULTIS
// ============================================================

/** Plazas de una sesión de un grupo: los propios que van + los multis apuntados. */
export function plazasSesion(aforo: number | null, inscritos: number, faltan: number, multis: number): CuentaSesion {
  return cuentaSesion(aforo, inscritos, faltan, multis);
}

/** ¿Cabe un multi más en esa sesión? Sin aforo puesto, sí: no se sabe, no se bloquea. */
export const quedaPlaza = (c: CuentaSesion) => c.libres === null || c.libres > 0;

/** Las fechas (lunes = 1) de la semana, para quien las necesite pintar. */
export const fechasDeLaSemana = diasDeSemana;
