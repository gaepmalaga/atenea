import { describe, it, expect } from 'vitest';
import { slugDeAcademia, esSlugValido, normalizeAcademyInput } from '../app/lib/academies';

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
