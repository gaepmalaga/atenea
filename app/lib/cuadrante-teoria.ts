/**
 * EL CUADRANTE SEMANAL DE TEORÍA (regla 142).
 *
 * Alphapol manda cada semana una imagen con las clases de teoría: una columna
 * por día, las formaciones extras arriba (el Curso OSINT…) y debajo cada clase,
 * con el color de su grupo, su hora, el tema (con su (I)/(II) si el grupo lo da
 * en dos clases), la nota que haya puesto quien programa («Simulacro +»,
 * «Organigrama») y quién la da.
 *
 * No guarda nada (como el calendario, regla 105): se DERIVA de los eventos de la
 * semana que ya arma `armaCalendario`. Tres salidas de una sola rejilla: el
 * panel, la imagen y el texto de WhatsApp.
 *
 * MÓDULO PURO (regla 21).
 */

import { diaSemanaDe, sumaDias } from './asistencia.ts';
import type { EventoCalendario } from './calendario.ts';

/** Los colores de los grupos, en el orden de la imagen de Alphapol: azul, verde y rojo; luego otros. */
export const PALETA_GRUPOS = [
  { fondo: '#dbeafe', borde: '#93c5fd', pastilla: '#2563eb' },
  { fondo: '#dcfce7', borde: '#86efac', pastilla: '#16a34a' },
  { fondo: '#fee2e2', borde: '#fca5a5', pastilla: '#dc2626' },
  { fondo: '#ede9fe', borde: '#c4b5fd', pastilla: '#7c3aed' },
  { fondo: '#ffedd5', borde: '#fdba74', pastilla: '#ea580c' },
] as const;
export type ColorGrupo = (typeof PALETA_GRUPOS)[number];

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export type ClaseCuadranteTeoria = {
  id: string;
  grupoId: string;
  grupo: string;
  color: ColorGrupo;
  inicio: string | null;
  fin: string | null;
  /** «10:00 – 13:00». */
  hora: string;
  /** La nota de quien programa, tal cual («Simulacro +»); `null` si no hay. */
  nota: string | null;
  /** «Tema 6 (II)» · «Temas 6 y 8» · `null` si no hay tema. */
  tema: string | null;
  /** Los nombres de quien la da (uno, o dos). */
  profesores: string[];
  /** Sin profesor ni tema: aún no se ha programado. */
  sinPlanificar: boolean;
};

export type ExtraCuadranteTeoria = { id: string; titulo: string; hora: string | null; profesores: string[]; externos: boolean };

export type DiaCuadranteTeoria = { fecha: string; titulo: string; extras: ExtraCuadranteTeoria[]; clases: ClaseCuadranteTeoria[] };

export type CuadranteTeoria = {
  lunes: string;
  /** «Semana del 23 al 27 de noviembre». */
  rango: string;
  dias: DiaCuadranteTeoria[];
  /** Cuántas clases de la semana siguen sin programar. */
  sinPlanificar: number;
};

/** «Semana del 23 al 27 de noviembre» (o «… del 27 de noviembre al 1 de diciembre»). */
export function rangoDeSemana(lunes: string, ultimo: string): string {
  const [, m1, d1] = lunes.split('-').map(Number);
  const [, m2, d2] = ultimo.split('-').map(Number);
  return m1 === m2
    ? `Semana del ${d1} al ${d2} de ${MESES[m2 - 1]}`
    : `Semana del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]}`;
}

/** «Tema 6 (II)», «Temas 6 y 8 (II)»: el romano va tras cada tema que lo lleva. */
export function textoTemaConParte(temas: number[], parte: (tema: number) => string): string | null {
  if (!temas.length) return null;
  const con = temas.map((t) => { const p = parte(t); return p ? `${t} (${p})` : String(t); });
  if (con.length === 1) return `Tema ${con[0]}`;
  return `Temas ${con.slice(0, -1).join(', ')} y ${con[con.length - 1]}`;
}

/** `10:00` → `10:00`; los dos juntos, «10:00 – 13:00»; sin fin, solo el inicio. */
const horaRango = (i: string | null, f: string | null) => (i ? (f ? `${i} – ${f}` : i) : '');

/**
 * El cuadrante de la semana que empieza en `lunes`. De lunes a viernes siempre;
 * sábado y domingo solo si ese día tiene algo. Los días «sin clase» no salen.
 *
 * - `eventos`: los de `armaCalendario` para esa semana.
 * - `partes`: `partesDeTema` (`app/lib/teoria.ts`), con todo lo apuntado al grupo.
 * - `ordenGrupos`: los grupos de teoría en el orden que da el color (azul, verde, rojo…).
 */
export function armaCuadranteTeoria(p: {
  lunes: string;
  eventos: EventoCalendario[];
  partes: Map<string, string>;
  ordenGrupos: string[];
}): CuadranteTeoria {
  const color = (grupoId: string): ColorGrupo => PALETA_GRUPOS[Math.max(0, p.ordenGrupos.indexOf(grupoId)) % PALETA_GRUPOS.length];
  const fechas = Array.from({ length: 7 }, (_, i) => sumaDias(p.lunes, i));
  const delDia = (f: string) => p.eventos.filter((e) => e.fecha === f);
  const conCosas = (f: string) => delDia(f).some((e) => (e.tipo === 'clase' && e.esTeoria) || e.tipo === 'extra');

  const dias: DiaCuadranteTeoria[] = fechas
    .filter((f) => diaSemanaDe(f) <= 5 || conCosas(f))
    .map((f) => {
      const evs = delDia(f);
      const clases = evs
        .filter((e) => e.tipo === 'clase' && e.esTeoria && e.grupoId)
        .sort((a, b) => (a.inicio ?? '').localeCompare(b.inicio ?? '') || (a.grupo ?? '').localeCompare(b.grupo ?? '', 'es'))
        .map((e): ClaseCuadranteTeoria => ({
          id: e.id,
          grupoId: e.grupoId!,
          grupo: e.grupo ?? '',
          color: color(e.grupoId!),
          inicio: e.inicio,
          fin: e.fin,
          hora: horaRango(e.inicio, e.fin),
          nota: e.nota,
          tema: textoTemaConParte(e.temas, (t) => p.partes.get(`${e.grupoId}|${f}|${t}`) ?? ''),
          profesores: e.profesores,
          sinPlanificar: e.sinPlanificar,
        }));
      const extras = evs
        .filter((e) => e.tipo === 'extra')
        .sort((a, b) => (a.inicio ?? '').localeCompare(b.inicio ?? '') || a.titulo.localeCompare(b.titulo, 'es'))
        .map((e): ExtraCuadranteTeoria => ({
          id: e.id, titulo: e.titulo, hora: e.inicio ? horaRango(e.inicio, e.fin) : null, profesores: e.profesores,
          externos: e.audiencia === 'externos' || e.audiencia === 'ambos',
        }));
      return { fecha: f, titulo: `${DIAS[diaSemanaDe(f)]} ${Number(f.slice(8, 10))}`, extras, clases };
    });

  const ultimo = dias.length ? dias[dias.length - 1].fecha : sumaDias(p.lunes, 4);
  return {
    lunes: p.lunes,
    rango: rangoDeSemana(p.lunes, ultimo),
    dias,
    sinPlanificar: dias.reduce((n, d) => n + d.clases.filter((c) => c.sinPlanificar).length, 0),
  };
}

/** «Lucio» · «Morato y Enrique». */
export const textoProfesores = (nombres: string[]) =>
  nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;

/** El texto del cuadrante para pegarlo en WhatsApp (la imagen es la otra salida). */
export function textoCuadranteTeoria(c: CuadranteTeoria): string {
  const lineas: string[] = [`*CUADRANTE SEMANAL DE CLASES*`, c.rango, ''];
  for (const d of c.dias) {
    if (!d.clases.length && !d.extras.length) continue;
    lineas.push(`*${d.titulo}*`);
    for (const x of d.extras) lineas.push(`  ${x.hora ? `${x.hora} · ` : ''}${x.titulo}${x.profesores.length ? ` (${textoProfesores(x.profesores)})` : ''}`);
    for (const k of d.clases) {
      const que = [k.nota, k.tema].filter(Boolean).join(' ');
      lineas.push(`  ${k.hora} · ${que || 'Sin programar'}${k.profesores.length ? ` — ${textoProfesores(k.profesores)}` : ''}`);
    }
    lineas.push('');
  }
  return lineas.join('\n').trim();
}
