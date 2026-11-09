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
 * Módulo PURO (regla 21): lo comparten el panel, la imagen que se descarga, el
 * texto de WhatsApp y las acciones. Las fechas son `YYYY-MM-DD` en la hora de
 * la academia (regla 82).
 */

import { DIAS_SEMANA, diaSemanaDe, horaCorta, sumaDias, cuentaSesion, type HorarioGrupo, type CuentaSesion } from './asistencia.ts';
import { TIPOS_SESION, MAX_TITULO, diasDeSemana, esTipoSesion, type TipoSesion } from './sesiones.ts';

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
  /** Hay sesión en un día que no es de clase del grupo. */
  fueraDeHorario: boolean;
  /** Lo que avisa el sistema (profesor en dos sitios a la vez). */
  avisos: string[];
};

export type DiaCuadrante = { fecha: string; titulo: string; filas: FilaCuadrante[] };

export type TurnoCuadrante = { id: TurnoId; hora: string | null; grupos: string[] };

export type Cuadrante = {
  lunes: string;
  rango: string;
  dias: DiaCuadrante[];
  turnos: TurnoCuadrante[];
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
 * Los días que salen en el cuadrante: los días de clase de los grupos y,
 * además, cualquier día donde haya una sesión (la de Multi, o una suelta).
 */
export function fechasDelCuadrante(grupos: GrupoCuadrante[], sesiones: SesionCuadrante[], lunes: string): string[] {
  const set = new Set<string>();
  for (const g of grupos) if (!g.esMulti) for (const f of fechasDelGrupo(g, lunes)) set.add(f);
  const fin = sumaDias(lunes, 6);
  for (const s of sesiones) if (s.fecha >= lunes && s.fecha <= fin) set.add(s.fecha);
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
}): Cuadrante {
  const { lunes, grupos, profesores } = params;
  const fin = sumaDias(lunes, 6);
  const sesiones = params.sesiones
    .filter((s) => s.fecha >= lunes && s.fecha <= fin)
    .sort((a, b) => a.position - b.position || a.titulo.localeCompare(b.titulo, 'es'));
  const orden = [...grupos].sort(ordenGrupos);
  const prof = new Map(profesores.map((p) => [p.id, p]));
  const choques = choquesDeProfesor(sesiones, grupos, profesores);

  const dias: DiaCuadrante[] = fechasDelCuadrante(grupos, sesiones, lunes).map((fecha) => {
    const filas: FilaCuadrante[] = [];
    for (const g of orden) {
      const delDia = sesiones.filter((s) => s.classId === g.id && s.fecha === fecha);
      const diaDeClase = !g.esMulti && fechasDelGrupo(g, lunes).includes(fecha);
      // Multi sale siempre (es la celda de abajo del día, a veces vacía); el
      // resto, solo si tiene clase ese día o una sesión suelta.
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
        fueraDeHorario: !g.esMulti && !diaDeClase && !!sesion,
        avisos: sesion ? choques.get(sesion.id) ?? [] : [],
      });
    }
    return { fecha, titulo: tituloDia(fecha), filas };
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
  tipo: TipoSesion;
  profesorId: string | null;
  horaPropia: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida lo que llega de una celda del cuadrante (regla 27: igual que lo que escribe la IA). */
export function normalizaCelda(raw: Record<string, unknown> | null | undefined):
  { ok: true; valor: CeldaEntrada } | { ok: false; error: string } {
  const r = raw ?? {};
  const titulo = typeof r.titulo === 'string' ? r.titulo.replace(/\0/g, '').trim() : '';
  if (!titulo) return { ok: false, error: 'Escribe qué toca (por ejemplo, FLK 5.0).' };
  if (titulo.length > MAX_TITULO) return { ok: false, error: `El título admite hasta ${MAX_TITULO} caracteres.` };
  const tipo = r.tipo === undefined || r.tipo === null || r.tipo === '' ? 'otro' : r.tipo;
  if (!esTipoSesion(tipo)) return { ok: false, error: `El tipo tiene que ser uno de: ${TIPOS_SESION.join(', ')}.` };
  const profesorId = r.profesorId === undefined || r.profesorId === null || r.profesorId === '' ? null : r.profesorId;
  if (profesorId !== null && !(typeof profesorId === 'string' && UUID.test(profesorId))) {
    return { ok: false, error: 'Ese profesor no es válido.' };
  }
  const vacia = r.horaPropia === undefined || r.horaPropia === null || r.horaPropia === '';
  const horaPropia = vacia ? null : horaCorta(r.horaPropia);
  if (!vacia && !horaPropia) return { ok: false, error: 'La hora tiene que ser como 18:30.' };
  return { ok: true, valor: { titulo, tipo, profesorId, horaPropia } };
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
