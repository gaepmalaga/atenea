import { describe, it, expect } from 'vitest';
import { slugDeAcademia, esSlugValido, normalizeAcademyInput, resumeAcademias } from '../app/lib/academies';

/**
 * ACADEMIAS (P11 · multi-academia). El slug es la URL (`/alphapol`), así que
 * lo que vigila este módulo es exactamente lo que no puede colar: una ruta
 * reservada, un formato que rompería la URL, o un formulario a medio rellenar.
 */

describe('slugDeAcademia', () => {
  it('quita tildes, minúsculas, guiones', () => {
    expect(slugDeAcademia('Alpha Policía')).toBe('alpha-policia');
    expect(slugDeAcademia('  Depol!!  ')).toBe('depol');
  });

  it('recorta a la longitud máxima de una URL', () => {
    expect(slugDeAcademia('x'.repeat(80)).length).toBeLessThanOrEqual(30);
  });
});

describe('esSlugValido', () => {
  it('acepta minúsculas, dígitos y guiones interiores', () => {
    expect(esSlugValido('alphapol')).toBe(true);
    expect(esSlugValido('corpore-pol-2')).toBe(true);
  });

  it('rechaza mayúsculas, espacios y símbolos', () => {
    expect(esSlugValido('AlphaPol')).toBe(false);
    expect(esSlugValido('alpha pol')).toBe(false);
    expect(esSlugValido('alpha_pol')).toBe(false);
    expect(esSlugValido('-alpha')).toBe(false);
    expect(esSlugValido('alpha-')).toBe(false);
  });

  it('rechaza lo demasiado corto o demasiado largo', () => {
    expect(esSlugValido('a')).toBe(false);
    expect(esSlugValido('x'.repeat(31))).toBe(false);
  });

  it('rechaza las rutas reservadas de la propia aplicación', () => {
    expect(esSlugValido('admin')).toBe(false);
    expect(esSlugValido('superadmin')).toBe(false);
    expect(esSlugValido('api')).toBe(false);
    expect(esSlugValido('login')).toBe(false);
  });
});

describe('normalizeAcademyInput', () => {
  it('sin nombre no se guarda', () => {
    expect(normalizeAcademyInput({ slug: 'depol' })).toBeNull();
    expect(normalizeAcademyInput({ name: '   ' })).toBeNull();
  });

  it('deriva el slug del nombre si no llega uno explícito', () => {
    expect(normalizeAcademyInput({ name: 'DePol Granada' })).toEqual({
      slug: 'depol-granada',
      name: 'DePol Granada',
    });
  });

  it('usa el slug explícito si llega uno, normalizado igual', () => {
    expect(normalizeAcademyInput({ name: 'DePol Granada', slug: 'DePol' })?.slug).toBe('depol');
  });

  it('un slug reservado o inválido descarta el alta entera', () => {
    expect(normalizeAcademyInput({ name: 'Panel', slug: 'admin' })).toBeNull();
    expect(normalizeAcademyInput({ name: 'X', slug: 'a' })).toBeNull();
  });
});

describe('resumeAcademias (P11f: la comparativa del panel de superadmin)', () => {
  const academias = [
    { id: 'a1', slug: 'alphapol', name: 'Alphapol' },
    { id: 'a2', slug: 'depol', name: 'DePol' },
  ];

  it('cuenta alumnos y admins por separado, y solo de SU academia', () => {
    const miembros = [
      { academy_id: 'a1', user_id: 'u1' },
      { academy_id: 'a1', user_id: 'u2' },
      { academy_id: 'a1', user_id: 'u3' },
      { academy_id: 'a2', user_id: 'u4' },
    ];
    const roles = new Map([['u1', 'student'], ['u2', 'student'], ['u3', 'admin'], ['u4', 'student']]);
    const [alphapol, depol] = resumeAcademias(academias, miembros, roles, new Map(), []);
    expect(alphapol.alumnos).toBe(2);
    expect(alphapol.admins).toBe(1);
    expect(depol.alumnos).toBe(1);
    expect(depol.admins).toBe(0);
  });

  it('sin rol conocido, cuenta como alumno (el valor por defecto de profiles.role)', () => {
    const miembros = [{ academy_id: 'a1', user_id: 'sin-perfil' }];
    const [alphapol] = resumeAcademias(academias, miembros, new Map(), new Map(), []);
    expect(alphapol.alumnos).toBe(1);
    expect(alphapol.admins).toBe(0);
  });

  it('el coste de IA se atribuye por user_id, cruzando contra academy_members', () => {
    const miembros = [
      { academy_id: 'a1', user_id: 'u1' },
      { academy_id: 'a2', user_id: 'u2' },
    ];
    const coste = new Map([['u1', 3.5], ['u2', 1.2]]);
    const [alphapol, depol] = resumeAcademias(academias, miembros, new Map(), coste, []);
    expect(alphapol.costeIA).toBe(3.5);
    expect(depol.costeIA).toBe(1.2);
  });

  it('un alumno en dos academias cuenta su gasto en las dos (aproximación deliberada)', () => {
    const miembros = [
      { academy_id: 'a1', user_id: 'u1' },
      { academy_id: 'a2', user_id: 'u1' },
    ];
    const coste = new Map([['u1', 10]]);
    const [alphapol, depol] = resumeAcademias(academias, miembros, new Map(), coste, []);
    expect(alphapol.costeIA).toBe(10);
    expect(depol.costeIA).toBe(10);
  });

  it('los ingresos del mes se agregan por organization_id, y solo lo PAGADO cuenta', () => {
    const pagos = [
      { organization_id: 'a1', amount_eur: 30, paid: true },
      { organization_id: 'a1', amount_eur: 30, paid: true },
      { organization_id: 'a1', amount_eur: 30, paid: false },
      { organization_id: 'a2', amount_eur: 20, paid: true },
    ];
    const [alphapol, depol] = resumeAcademias(academias, [], new Map(), new Map(), pagos);
    expect(alphapol.ingresosMes).toBe(60);
    expect(depol.ingresosMes).toBe(20);
  });

  it('sin importe (regla 16) cuenta como 0, no revienta la suma', () => {
    const pagos = [{ organization_id: 'a1', amount_eur: null, paid: true }];
    const [alphapol] = resumeAcademias(academias, [], new Map(), new Map(), pagos);
    expect(alphapol.ingresosMes).toBe(0);
  });

  it('una academia sin ningún miembro ni pago sale en 0, no desaparece de la lista', () => {
    const resumen = resumeAcademias(academias, [], new Map(), new Map(), []);
    expect(resumen).toHaveLength(2);
    expect(resumen.every((a) => a.alumnos === 0 && a.admins === 0 && a.costeIA === 0 && a.ingresosMes === 0)).toBe(true);
  });
});
