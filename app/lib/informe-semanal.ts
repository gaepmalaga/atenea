/**
 * EL INFORME SEMANAL Y LAS SEÑALES DE ABANDONO (regla 116).
 *
 * POR QUÉ EXISTE
 * «Alumnos» ya avisaba de quien lleva 14 días sin entrar. Para entonces el
 * alumno casi siempre se ha ido: dos semanas sin tocar la aplicación no es el
 * principio del abandono, es el final. Lo que avisa ANTES es el cambio: quien
 * hacía 200 preguntas a la semana y esta ha hecho 30, quien lleva tres semanas
 * bajando, quien empieza a faltar a clase. Eso no se ve mirando un número
 * suelto: hay que compararlo con lo que ese mismo alumno venía haciendo.
 *
 * Cada señal dice POR QUÉ con una frase, porque un «riesgo alto» sin motivo no
 * le sirve a quien tiene que coger el teléfono (regla 35: lo accionable).
 *
 * MÓDULO PURO (regla 21). Las cuentas por semana llegan hechas de la base de
 * datos (`panel_actividad_semanal`, regla 91); aquí solo se comparan.
 */

export type FilaSemana = {
  userId: string;
  /** El lunes de esa semana, `AAAA-MM-DD`, en la hora de la academia. */
  semana: string;
  contestadas: number;
  aciertos: number;
  blancos: number;
  diasActivos: number;
  simulacros: number;
  /** ISO de la última respuesta de esa semana. */
  ultima: string | null;
};

export type AlumnoInforme = {
  id: string;
  email: string | null;
  nombre: string;
  /** ISO del alta. */
  alta: string | null;
  /** Avisos de «no voy a clase» en los últimos 14 días. */
  faltas14: number;
};

export type NivelRiesgo = 'alto' | 'medio' | 'bajo';

export type Riesgo = { nivel: NivelRiesgo; puntos: number; motivos: string[] };

export type FilaInforme = {
  id: string;
  nombre: string;
  email: string | null;
  contestadas: number;
  /** La semana anterior a la del informe. */
  anteriores: number;
  /** La media de las cuatro semanas anteriores (las vacías cuentan como cero). */
  mediaPrevia: number;
  /** `null` si no contestó nada: sin datos no es 0 % (regla 8). */
  acierto: number | null;
  aciertoPrevio: number | null;
  diasActivos: number;
  simulacros: number;
  /** `null` si no ha contestado nunca en las semanas que se miran. */
  diasSinActividad: number | null;
  riesgo: Riesgo;
};

export type InformeSemanal = {
  semana: string;
  /** El domingo de esa semana. */
  hasta: string;
  /** La semana no ha terminado: las comparaciones van a prorrata. */
  enCurso: boolean;
  academia: {
    alumnos: number;
    activos: number;
    contestadas: number;
    contestadasAnterior: number;
    acierto: number | null;
    simulacros: number;
    riesgoAlto: number;
    riesgoMedio: number;
  };
  filas: FilaInforme[];
};

const DIA_MS = 86_400_000;

/** `AAAA-MM-DD` → fecha a mediodía UTC: sumar días no tropieza con el cambio de hora. */
const aFecha = (dia: string) => new Date(`${dia}T12:00:00Z`);
const aDia = (d: Date) => d.toISOString().slice(0, 10);

/** El lunes de la semana de `dia` (`AAAA-MM-DD`). */
export function lunesDe(dia: string): string {
  const d = aFecha(dia);
  const desdeLunes = (d.getUTCDay() + 6) % 7;
  return aDia(new Date(d.getTime() - desdeLunes * DIA_MS));
}

export function sumaDias(dia: string, n: number): string {
  return aDia(new Date(aFecha(dia).getTime() + n * DIA_MS));
}

/**
 * La semana que enseña el informe si no se elige: la que está en curso a
 * partir del jueves; antes, la anterior. Un lunes por la mañana «esta semana»
 * está vacía para todo el mundo, y un informe que marca a toda la academia en
 * riesgo no avisa de nada (regla 66).
 */
export function semanaPorDefecto(hoy: string): string {
  const lunes = lunesDe(hoy);
  const transcurridos = Math.round((aFecha(hoy).getTime() - aFecha(lunes).getTime()) / DIA_MS);
  return transcurridos >= 3 ? lunes : sumaDias(lunes, -7);
}

const pct = (aciertos: number, contestadas: number): number | null =>
  contestadas > 0 ? Math.round((aciertos / contestadas) * 100) : null;

export type EntradaRiesgo = {
  /** Días desde la última respuesta; `null` si no hay ninguna. */
  diasSinActividad: number | null;
  /** Días desde el alta; `null` si no se sabe. */
  diasDesdeAlta: number | null;
  contestadas: number;
  mediaPrevia: number;
  /** Qué parte de la semana ha pasado (1 si está completa). */
  fraccion: number;
  /** Semanas seguidas, hasta esta, haciendo menos que la anterior. */
  semanasBajando: number;
  acierto: number | null;
  aciertoPrevio: number | null;
  /** Con cuántas respuestas se calculó cada acierto. */
  base: number;
  basePrevia: number;
  faltas14: number;
};

/** Por debajo de esto, la media de un alumno no dice nada: es ruido. */
export const MEDIA_MINIMA = 15;

/**
 * Las señales, sumadas. Cada una pone sus puntos y su frase; el nivel sale del
 * total: 60 o más es «alto» (llamar esta semana), 30 o más «medio» (vigilar).
 */
export function riesgoDeAbandono(e: EntradaRiesgo): Riesgo {
  const motivos: string[] = [];
  let puntos = 0;
  const suma = (n: number, motivo: string) => { puntos += n; motivos.push(motivo); };

  if (e.diasSinActividad === null) {
    if (e.diasDesdeAlta !== null && e.diasDesdeAlta >= 7) suma(60, `No ha empezado: lleva ${e.diasDesdeAlta} días de alta sin contestar nada`);
    else if (e.diasDesdeAlta === null) suma(40, 'No ha contestado nada en las últimas semanas');
  } else if (e.diasSinActividad >= 21) suma(70, `Lleva ${e.diasSinActividad} días sin contestar`);
  else if (e.diasSinActividad >= 14) suma(55, `Lleva ${e.diasSinActividad} días sin contestar`);
  else if (e.diasSinActividad >= 7) suma(35, `Lleva ${e.diasSinActividad} días sin contestar`);
  else if (e.diasSinActividad >= 4) suma(10, `Lleva ${e.diasSinActividad} días sin contestar`);

  // La caída se mide contra SU media, y a prorrata si la semana no ha acabado.
  if (e.mediaPrevia >= MEDIA_MINIMA) {
    const esperadas = e.mediaPrevia * Math.max(0.15, Math.min(1, e.fraccion));
    const ratio = e.contestadas / esperadas;
    const venia = `venía haciendo unas ${Math.round(e.mediaPrevia)} a la semana`;
    if (ratio < 0.25) suma(30, `Ha hecho ${e.contestadas} preguntas; ${venia}`);
    else if (ratio < 0.5) suma(18, `Ha hecho ${e.contestadas} preguntas; ${venia}`);
  }

  if (e.semanasBajando >= 3) suma(12, `Lleva ${e.semanasBajando} semanas seguidas haciendo menos`);

  if (e.acierto !== null && e.aciertoPrevio !== null && e.base >= 20 && e.basePrevia >= 20 && e.aciertoPrevio - e.acierto >= 10) {
    suma(10, `El acierto ha bajado del ${e.aciertoPrevio} % al ${e.acierto} %`);
  }

  if (e.faltas14 >= 2) suma(10, `Ha avisado de ${e.faltas14} faltas a clase en dos semanas`);

  puntos = Math.min(100, puntos);
  return { nivel: puntos >= 60 ? 'alto' : puntos >= 30 ? 'medio' : 'bajo', puntos, motivos };
}

/**
 * El informe de UNA semana. `hoy` y `semana` son días `AAAA-MM-DD` en la hora
 * de la academia; `filas` trae la actividad de esa semana y de las anteriores.
 */
export function construyeInforme(p: { hoy: string; semana: string; alumnos: AlumnoInforme[]; filas: FilaSemana[] }): InformeSemanal {
  const semana = lunesDe(p.semana);
  const hasta = sumaDias(semana, 6);
  const enCurso = p.hoy <= hasta && p.hoy >= semana;
  const diasVistos = enCurso ? Math.round((aFecha(p.hoy).getTime() - aFecha(semana).getTime()) / DIA_MS) + 1 : 7;
  const fraccion = diasVistos / 7;
  // Hasta cuándo se cuenta «sin actividad»: hoy, o el final de esa semana si ya pasó.
  const referencia = enCurso ? p.hoy : hasta;

  const porAlumno = new Map<string, Map<string, FilaSemana>>();
  for (const f of p.filas) {
    if (f.semana > semana) continue; // lo posterior a la semana del informe no cuenta
    const m = porAlumno.get(f.userId) ?? new Map<string, FilaSemana>();
    m.set(f.semana, f);
    porAlumno.set(f.userId, m);
  }

  const filas: FilaInforme[] = p.alumnos.map((a) => {
    const suyas = porAlumno.get(a.id) ?? new Map<string, FilaSemana>();
    const de = (n: number) => suyas.get(sumaDias(semana, -7 * n));
    const esta = de(0), previa = de(1);
    const previas = [1, 2, 3, 4].map((n) => de(n)?.contestadas ?? 0);
    const mediaPrevia = previas.reduce((s, n) => s + n, 0) / previas.length;

    // Semanas seguidas bajando: esta < anterior < la de antes…
    let semanasBajando = 0;
    for (let n = 0; n < 4; n++) {
      const actual = de(n)?.contestadas ?? 0, antes = de(n + 1)?.contestadas ?? 0;
      // La semana en curso solo cuenta si ya ha terminado: a medias siempre «baja».
      if (n === 0 && enCurso) continue;
      if (antes > 0 && actual < antes) semanasBajando++;
      else break;
    }

    let ultima: string | null = null;
    for (const f of suyas.values()) if (f.ultima && (!ultima || f.ultima > ultima)) ultima = f.ultima;
    const diasSinActividad = ultima
      ? Math.max(0, Math.floor((aFecha(referencia).getTime() + DIA_MS / 2 - new Date(ultima).getTime()) / DIA_MS))
      : null;
    const diasDesdeAlta = a.alta ? Math.max(0, Math.floor((aFecha(referencia).getTime() - new Date(a.alta).getTime()) / DIA_MS)) : null;

    const contestadas = esta?.contestadas ?? 0;
    const acierto = pct(esta?.aciertos ?? 0, contestadas);
    const aciertoPrevio = pct(previa?.aciertos ?? 0, previa?.contestadas ?? 0);

    return {
      id: a.id,
      nombre: a.nombre,
      email: a.email,
      contestadas,
      anteriores: previa?.contestadas ?? 0,
      mediaPrevia: Math.round(mediaPrevia),
      acierto,
      aciertoPrevio,
      diasActivos: esta?.diasActivos ?? 0,
      simulacros: esta?.simulacros ?? 0,
      diasSinActividad,
      riesgo: riesgoDeAbandono({
        diasSinActividad, diasDesdeAlta, contestadas, mediaPrevia, fraccion, semanasBajando,
        acierto, aciertoPrevio, base: contestadas, basePrevia: previa?.contestadas ?? 0, faltas14: a.faltas14,
      }),
    };
  });

  // Primero a quién hay que llamar; a igual riesgo, por nombre.
  filas.sort((x, y) => y.riesgo.puntos - x.riesgo.puntos || x.nombre.localeCompare(y.nombre, 'es'));

  const contestadas = filas.reduce((s, f) => s + f.contestadas, 0);
  let aciertos = 0;
  for (const a of p.alumnos) aciertos += porAlumno.get(a.id)?.get(semana)?.aciertos ?? 0;

  return {
    semana,
    hasta,
    enCurso,
    academia: {
      alumnos: filas.length,
      activos: filas.filter((f) => f.contestadas > 0).length,
      contestadas,
      contestadasAnterior: filas.reduce((s, f) => s + f.anteriores, 0),
      acierto: pct(aciertos, contestadas),
      simulacros: filas.reduce((s, f) => s + f.simulacros, 0),
      riesgoAlto: filas.filter((f) => f.riesgo.nivel === 'alto').length,
      riesgoMedio: filas.filter((f) => f.riesgo.nivel === 'medio').length,
    },
    filas,
  };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «Semana del 9 al 15 de noviembre». */
export function tituloSemana(semana: string): string {
  const ini = aFecha(semana), fin = aFecha(sumaDias(semana, 6));
  const mismoMes = ini.getUTCMonth() === fin.getUTCMonth();
  return mismoMes
    ? `Semana del ${ini.getUTCDate()} al ${fin.getUTCDate()} de ${MESES[fin.getUTCMonth()]}`
    : `Semana del ${ini.getUTCDate()} de ${MESES[ini.getUTCMonth()]} al ${fin.getUTCDate()} de ${MESES[fin.getUTCMonth()]}`;
}

/** El resumen en texto, para pegarlo en WhatsApp o en un correo. */
export function resumenEnTexto(informe: InformeSemanal, academia: string): string {
  const a = informe.academia;
  const lineas = [
    `*${academia} · ${tituloSemana(informe.semana)}*${informe.enCurso ? ' (en curso)' : ''}`,
    `${a.activos} de ${a.alumnos} alumnos han entrenado.`,
    `${a.contestadas} preguntas contestadas${a.contestadasAnterior ? ` (la semana anterior, ${a.contestadasAnterior})` : ''}${a.acierto !== null ? `, con un ${a.acierto} % de acierto` : ''}.`,
    a.simulacros ? `${a.simulacros} ${a.simulacros === 1 ? 'simulacro entregado' : 'simulacros entregados'}.` : '',
  ].filter(Boolean);
  const llamar = informe.filas.filter((f) => f.riesgo.nivel === 'alto');
  const vigilar = informe.filas.filter((f) => f.riesgo.nivel === 'medio');
  if (llamar.length) {
    lineas.push('', `*Para llamar (${llamar.length}):*`);
    for (const f of llamar) lineas.push(`• ${f.nombre}: ${f.riesgo.motivos[0] ?? 'riesgo alto'}`);
  }
  if (vigilar.length) {
    lineas.push('', `*Para vigilar (${vigilar.length}):*`);
    for (const f of vigilar) lineas.push(`• ${f.nombre}: ${f.riesgo.motivos[0] ?? 'riesgo medio'}`);
  }
  if (!llamar.length && !vigilar.length) lineas.push('', 'Nadie en riesgo esta semana.');
  return lineas.join('\n');
}
