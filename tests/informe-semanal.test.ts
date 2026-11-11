import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lunesDe, sumaDias, semanaPorDefecto, riesgoDeAbandono, construyeInforme, tituloSemana, resumenEnTexto,
  type EntradaRiesgo, type FilaSemana,
} from '../app/lib/informe-semanal';

/** Regla 116 · el informe semanal y las señales de abandono. */

const RAIZ = join(__dirname, '..');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (ruta: string) => stripComments(readFileSync(join(RAIZ, ruta), 'utf-8'));

const base: EntradaRiesgo = {
  diasSinActividad: 1, diasDesdeAlta: 90, contestadas: 200, mediaPrevia: 200, fraccion: 1, semanasBajando: 0,
  acierto: 70, aciertoPrevio: 70, base: 200, basePrevia: 200, faltas14: 0,
};

describe('las semanas', () => {
  it('empiezan en lunes', () => {
    expect(lunesDe('2026-11-11')).toBe('2026-11-09'); // miércoles
    expect(lunesDe('2026-11-09')).toBe('2026-11-09'); // lunes
    expect(lunesDe('2026-11-15')).toBe('2026-11-09'); // domingo
    expect(sumaDias('2026-10-25', 1)).toBe('2026-10-26'); // el día del cambio de hora
  });

  it('hasta el jueves se enseña la semana pasada: un lunes «esta semana» está vacía', () => {
    expect(semanaPorDefecto('2026-11-09')).toBe('2026-11-02'); // lunes
    expect(semanaPorDefecto('2026-11-11')).toBe('2026-11-02'); // miércoles
    expect(semanaPorDefecto('2026-11-12')).toBe('2026-11-09'); // jueves
  });

  it('se titulan en castellano, también a caballo entre dos meses', () => {
    expect(tituloSemana('2026-11-09')).toBe('Semana del 9 al 15 de noviembre');
    expect(tituloSemana('2026-10-26')).toBe('Semana del 26 de octubre al 1 de noviembre');
  });
});

describe('las señales de abandono', () => {
  it('quien sigue como siempre no tiene ninguna', () => {
    expect(riesgoDeAbandono(base)).toEqual({ nivel: 'bajo', puntos: 0, motivos: [] });
  });

  it('avisa ANTES de los 14 días: la caída contra su propia media', () => {
    const r = riesgoDeAbandono({ ...base, diasSinActividad: 5, contestadas: 30 });
    expect(r.nivel).toBe('medio');
    expect(r.motivos.join(' ')).toContain('venía haciendo unas 200');
  });

  it('dos semanas sin contestar es para llamar', () => {
    const r = riesgoDeAbandono({ ...base, diasSinActividad: 15, contestadas: 0 });
    expect(r.nivel).toBe('alto');
    expect(r.motivos[0]).toBe('Lleva 15 días sin contestar');
  });

  it('quien no ha empezado tras una semana de alta, también; quien entró ayer, no', () => {
    expect(riesgoDeAbandono({ ...base, diasSinActividad: null, diasDesdeAlta: 12, contestadas: 0, mediaPrevia: 0 }).nivel).toBe('alto');
    expect(riesgoDeAbandono({ ...base, diasSinActividad: null, diasDesdeAlta: 2, contestadas: 0, mediaPrevia: 0 }).nivel).toBe('bajo');
  });

  it('quien hace poco de siempre no «cae»: su media no dice nada', () => {
    expect(riesgoDeAbandono({ ...base, mediaPrevia: 8, contestadas: 0, diasSinActividad: 3 }).puntos).toBe(0);
  });

  it('a mitad de semana se compara a prorrata', () => {
    // Martes (2 de 7 días): con 50 de 200 va en su ritmo.
    expect(riesgoDeAbandono({ ...base, contestadas: 50, fraccion: 2 / 7 }).puntos).toBe(0);
    expect(riesgoDeAbandono({ ...base, contestadas: 50, fraccion: 1 }).puntos).toBeGreaterThan(0);
  });

  it('el acierto solo cuenta con respuestas suficientes', () => {
    expect(riesgoDeAbandono({ ...base, acierto: 55, aciertoPrevio: 70 }).motivos.join()).toContain('El acierto ha bajado del 70 % al 55 %');
    expect(riesgoDeAbandono({ ...base, acierto: 0, aciertoPrevio: 70, base: 3 }).puntos).toBe(0);
  });

  it('las señales se suman y no pasan de 100', () => {
    const r = riesgoDeAbandono({ ...base, diasSinActividad: 30, contestadas: 0, semanasBajando: 3, faltas14: 4 });
    expect(r.puntos).toBe(100);
    expect(r.motivos.length).toBeGreaterThanOrEqual(3);
  });
});

describe('el informe', () => {
  const semana = (userId: string, lunes: string, contestadas: number, aciertos = 0, ultima: string | null = `${lunes}T18:00:00Z`): FilaSemana =>
    ({ userId, semana: lunes, contestadas, aciertos, blancos: 0, diasActivos: contestadas ? 3 : 0, simulacros: 0, ultima });
  const alumnos = [
    { id: 'a', email: 'ana.ruiz@x.com', nombre: 'Ana Ruiz', alta: '2026-06-01T10:00:00Z', faltas14: 0 },
    { id: 'b', email: 'beto.gil@x.com', nombre: 'Beto Gil', alta: '2026-06-01T10:00:00Z', faltas14: 0 },
  ];
  const filas = [
    semana('a', '2026-11-02', 200, 150, '2026-11-07T18:00:00Z'), semana('a', '2026-10-26', 180, 130), semana('a', '2026-10-19', 220), semana('a', '2026-10-12', 200), semana('a', '2026-10-05', 190),
    semana('b', '2026-10-19', 200, 100, '2026-10-20T18:00:00Z'), semana('b', '2026-10-12', 210), semana('b', '2026-10-05', 190),
  ];
  const informe = construyeInforme({ hoy: '2026-11-11', semana: '2026-11-02', alumnos, filas });

  it('primero, a quien hay que llamar', () => {
    expect(informe.filas.map((f) => f.id)).toEqual(['b', 'a']);
    expect(informe.filas[0].riesgo.nivel).toBe('alto');
    expect(informe.filas[1].riesgo.nivel).toBe('bajo');
  });

  it('una semana pasada no está «en curso» y cuenta los días hasta su domingo', () => {
    expect(informe.enCurso).toBe(false);
    expect(informe.hasta).toBe('2026-11-08');
    expect(informe.filas.find((f) => f.id === 'b')!.diasSinActividad).toBe(19);
  });

  it('el pulso suma la academia, y sin respuestas el acierto es null y no 0 (regla 8)', () => {
    expect(informe.academia).toMatchObject({ alumnos: 2, activos: 1, contestadas: 200, contestadasAnterior: 180, acierto: 75, riesgoAlto: 1 });
    expect(informe.filas.find((f) => f.id === 'b')!.acierto).toBeNull();
    expect(construyeInforme({ hoy: '2026-11-11', semana: '2026-11-02', alumnos: [], filas: [] }).academia.acierto).toBeNull();
  });

  it('lo posterior a la semana del informe no se mira', () => {
    const conFuturo = construyeInforme({ hoy: '2026-11-11', semana: '2026-11-02', alumnos, filas: [...filas, semana('b', '2026-11-09', 500)] });
    expect(conFuturo.filas.find((f) => f.id === 'b')!.riesgo.nivel).toBe('alto');
  });

  it('el resumen para WhatsApp dice a quién llamar y por qué', () => {
    const texto = resumenEnTexto(informe, 'Alphapol');
    expect(texto).toContain('*Alphapol · Semana del 2 al 8 de noviembre*');
    expect(texto).toContain('*Para llamar (1):*');
    expect(texto).toContain('• Beto Gil: Lleva 19 días sin contestar');
  });
});

describe('la acción', () => {
  const src = lee('app/actions/informe.ts');
  it('es de la academia, y acotada a ella (regla 65)', () => {
    expect(src).toContain('requireAdmin()');
    expect(src).toContain(".eq('academy_id', organizationId)");
    expect(src).toContain(".eq('class_groups.organization_id', organizationId)");
  });
  it('las cuentas las hace la base de datos (regla 91)', () => {
    expect(src).toContain("rpc('panel_actividad_semanal'");
    expect(src).not.toContain("from('question_attempts')");
  });
  it('el guion revoca la función a quien no es el servidor', () => {
    const sql = readFileSync(join(RAIZ, 'docs/sql/informe-semanal.sql'), 'utf-8');
    expect(sql).toMatch(/revoke execute on function public\.panel_actividad_semanal\(uuid\[\], int\) from public, anon, authenticated/);
  });
});
