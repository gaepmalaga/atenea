import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resumenDeRevision, estadoDePregunta, laVenLosAlumnos, esFuente, QUE_SE_REVISA, type FilaParaResumen } from '../app/lib/revision';
import { FILTRO_SERVIBLE_REVISADO } from '../app/lib/questions';

/**
 * LO QUE EL TUTOR VE AL ENTRAR (regla 139): qué está publicado, qué está
 * publicado pero con algo pendiente y qué no está publicado, en total y por
 * tema. Las de la academia están publicadas aunque su explicación espere
 * revisión; las de la IA, no, hasta que un tutor las revisa enteras.
 */
const raiz = join(__dirname, '..');
const temas = [{ subjectId: 10, numero: 1, titulo: 'Derecho' }, { subjectId: 20, numero: 2, titulo: 'Constitución' }, { subjectId: 30, numero: 3, titulo: 'Vacío' }];
const f = (subject_id: number | null, fuente: string, status: string, reviewed_at: string | null = null): FilaParaResumen => ({ subject_id, fuente, status, reviewed_at });

describe('los tres puntos en los que está una pregunta', () => {
  it('con «solo revisadas»: academia sin revisar = publicada con algo pendiente; IA sin revisar = sin publicar', () => {
    expect(estadoDePregunta(f(10, 'academia', 'active'), true)).toBe('publicada_pendiente');
    expect(estadoDePregunta(f(10, 'academia', 'active', '2026-11-20'), true)).toBe('publicada_revisada');
    expect(estadoDePregunta(f(10, 'ia', 'active'), true)).toBe('sin_publicar');
    expect(estadoDePregunta(f(10, 'ia', 'active', '2026-11-20'), true)).toBe('publicada_revisada');
    expect(estadoDePregunta(f(10, 'ia', 'candidate'), true)).toBe('sin_publicar');
    expect(estadoDePregunta(f(10, 'ia', 'inactive'), true)).toBe('fuera');
  });

  it('una pendiente (candidate) nunca está publicada, ni siquiera la de la academia', () => {
    expect(laVenLosAlumnos(f(10, 'academia', 'candidate'), true)).toBe(false);
    expect(laVenLosAlumnos(f(10, 'academia', 'candidate'), false)).toBe(false);
  });

  it('sin «solo revisadas», todas las activas están publicadas', () => {
    expect(laVenLosAlumnos(f(10, 'ia', 'active'), false)).toBe(true);
    expect(estadoDePregunta(f(10, 'ia', 'active'), false)).toBe('publicada_pendiente');
  });
});

describe('el resumen del tutor', () => {
  const filas = [
    f(10, 'academia', 'active'), f(10, 'academia', 'active', '2026-11-20'), f(10, 'ia', 'active'),
    f(20, 'ia', 'candidate'), f(20, 'ia', 'active', '2026-11-20'), f(20, 'ia', 'inactive'),
  ];

  it('publicadas, publicadas con algo pendiente y sin publicar', () => {
    const r = resumenDeRevision(filas, temas, true);
    expect(r.publicadas).toBe(3);
    expect(r.revisadas).toBe(2);
    expect(r.publicadasPendientes).toBe(1);
    expect(r.sinPublicar).toBe(2);
    // Lo que le falta al tutor, por bloque.
    expect(r.porRevisar).toEqual({ academia: 1, ia: 2 });
  });

  it('sin «solo revisadas», lo de la IA sin revisar también está publicado (y sigue por revisar)', () => {
    const r = resumenDeRevision(filas, temas, false);
    expect(r.publicadas).toBe(4);
    expect(r.sinPublicar).toBe(1);
    expect(r.porRevisar).toEqual({ academia: 1, ia: 2 });
  });

  it('por tema, ordenado, sin los temas vacíos', () => {
    const r = resumenDeRevision(filas, temas, true);
    expect(r.porTema.map((t) => [t.numero, t.publicadas, t.revisadas, t.sinPublicar, t.academia, t.ia])).toEqual([[1, 2, 1, 1, 1, 1], [2, 1, 1, 1, 0, 1]]);
  });

  it('lo que no es de la academia es de la IA, también lo que no dice nada', () => {
    expect(resumenDeRevision([f(10, '', 'active')], temas, true).porRevisar).toEqual({ academia: 0, ia: 1 });
  });

  it('una pregunta sin tema (o de un tema que no se enseña) cuenta en el total pero en ninguna fila', () => {
    const r = resumenDeRevision([f(null, 'academia', 'active'), f(999, 'academia', 'active')], temas, true);
    expect(r.publicadas).toBe(2);
    expect(r.porTema).toEqual([]);
  });

  it('lo que se revisa de cada bloque se dice con palabras', () => {
    expect(esFuente('academia') && esFuente('ia') && !esFuente('otra')).toBe(true);
    expect(QUE_SE_REVISA.academia.que).toBe('Solo la explicación');
    expect(QUE_SE_REVISA.ia.que).toBe('La pregunta entera');
  });
});

describe('lo que se sirve a los alumnos es lo que el tutor ve como publicado', () => {
  it('los tres sitios que sirven preguntas usan el mismo filtro, que deja pasar revisadas y de la academia', () => {
    expect(FILTRO_SERVIBLE_REVISADO).toBe('reviewed_at.not.is.null,fuente.eq.academia');
    const codigo = (f: string) => readFileSync(join(raiz, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
    expect(codigo('app/actions/exams.ts').match(/\.or\(FILTRO_SERVIBLE_REVISADO\)/g)?.length).toBe(2);
    expect(codigo('app/actions/evolucion.ts')).toMatch(/\.or\(FILTRO_SERVIBLE_REVISADO\)/);
    // Ya nadie filtra solo por «revisada»: dejaría fuera las de la academia.
    for (const fich of ['app/actions/exams.ts', 'app/actions/evolucion.ts']) expect(codigo(fich)).not.toMatch(/\.not\('reviewed_at', 'is', null\)/);
  });
});
