import { describe, it, expect } from 'vitest';
import { resumenDeRevision, esFuente, QUE_SE_REVISA, type FilaParaResumen } from '../app/lib/revision';

/**
 * LO QUE EL TUTOR VE AL ENTRAR (regla 139): cuántas preguntas ven ya los
 * alumnos y cuántas faltan, por bloque (academia / IA) y por tema.
 */
const temas = [{ subjectId: 10, numero: 1, titulo: 'Derecho' }, { subjectId: 20, numero: 2, titulo: 'Constitución' }, { subjectId: 30, numero: 3, titulo: 'Vacío' }];
const f = (subject_id: number | null, fuente: string, status: string, reviewed_at: string | null = null): FilaParaResumen => ({ subject_id, fuente, status, reviewed_at });

describe('el resumen del tutor', () => {
  const filas = [
    f(10, 'academia', 'active'), f(10, 'academia', 'active', '2026-11-20'), f(10, 'ia', 'active'),
    f(20, 'ia', 'candidate'), f(20, 'ia', 'active', '2026-11-20'), f(20, 'ia', 'inactive'),
  ];

  it('con «solo revisadas», los alumnos ven solo las revisadas', () => {
    const r = resumenDeRevision(filas, temas, true);
    expect(r.alumnosVen).toBe(2);
    expect(r.porRevisar).toEqual({ academia: 1, ia: 2 });
  });

  it('sin «solo revisadas», ven todas las activas (y lo por revisar no cambia)', () => {
    const r = resumenDeRevision(filas, temas, false);
    expect(r.alumnosVen).toBe(4);
    expect(r.porRevisar).toEqual({ academia: 1, ia: 2 });
  });

  it('por tema, ordenado, sin los temas vacíos; una pendiente cuenta como por revisar y no como vista', () => {
    const r = resumenDeRevision(filas, temas, true);
    expect(r.porTema.map((t) => [t.numero, t.ven, t.academia, t.ia])).toEqual([[1, 1, 1, 1], [2, 1, 0, 1]]);
  });

  it('lo que no es de la academia es de la IA, también lo que no dice nada', () => {
    expect(resumenDeRevision([f(10, '', 'active')], temas, true).porRevisar).toEqual({ academia: 0, ia: 1 });
  });

  it('una pregunta sin tema (o de un tema que no se enseña) cuenta en el total pero en ninguna fila', () => {
    const r = resumenDeRevision([f(null, 'ia', 'active'), f(999, 'ia', 'active')], temas, false);
    expect(r.alumnosVen).toBe(2);
    expect(r.porTema).toEqual([]);
  });

  it('lo que se revisa de cada bloque se dice con palabras', () => {
    expect(esFuente('academia') && esFuente('ia') && !esFuente('otra')).toBe(true);
    expect(QUE_SE_REVISA.academia.que).toBe('Solo la explicación');
    expect(QUE_SE_REVISA.ia.que).toBe('La pregunta entera');
  });
});
