import { describe, it, expect } from 'vitest';
import { corrigeNumeracion, numeraOpciones } from '../app/lib/numeracion-opciones';

/**
 * «La opción correcta es la 1» (contando desde 0) se leía como la A cuando era
 * la B. Se cambia por la letra, solo cuando se puede demostrar desde dónde
 * cuenta la explicación (regla 139).
 */
describe('las explicaciones que numeran las opciones', () => {
  it('desde 0: la que declara la correcta, y las incorrectas', () => {
    const r = corrigeNumeracion('La opción correcta es la 1, ya que el texto lo dice. La opción 0 es incorrecta porque no. La opción 2 es incorrecta porque tampoco.', 1);
    expect(r?.texto).toBe('La opción correcta es la B, ya que el texto lo dice. La opción A es incorrecta porque no. La opción C es incorrecta porque tampoco.');
    expect(r?.desde).toBe(0);
  });

  it('una «opción 0» demuestra que cuenta desde 0, aunque no declare la correcta', () => {
    expect(corrigeNumeracion('El artículo lo dice. La opción 0 reproduce fielmente estas condiciones.', 0)?.texto).toBe('El artículo lo dice. La opción A reproduce fielmente estas condiciones.');
  });

  it('sin «opción 0», lo demuestra la que declara la correcta: desde 1 si coincide con la marcada +1', () => {
    expect(corrigeNumeracion('La opción correcta es la 2. La opción 1 es incorrecta. La opción 3 es incorrecta.', 1)?.texto)
      .toBe('La opción correcta es la B. La opción A es incorrecta. La opción C es incorrecta.');
  });

  it('si la explicación declara correcta una que no es la marcada, no se toca (lo mira un tutor)', () => {
    expect(corrigeNumeracion('La opción correcta es la 2. La opción 0 es incorrecta.', 1)).toBeNull();
  });

  it('sin forma de saber desde dónde cuenta, no se toca', () => {
    expect(corrigeNumeracion('La opción 1 es incorrecta porque no.', 2)).toBeNull();
  });

  it('las listas («las opciones 0 y 2») no se convierten solas', () => {
    expect(corrigeNumeracion('La opción correcta es la 1. Las opciones 0 y 2 son incorrectas.', 1)).toBeNull();
    expect(corrigeNumeracion('La opción correcta es la 1. La opción 0 y 2 no valen.', 1)).toBeNull();
  });

  it('una cifra fuera de rango no se convierte', () => {
    expect(corrigeNumeracion('La opción 3 es incorrecta. La opción 0 también.', 1)).toBeNull();
  });

  it('lo que no numera opciones, ni se toca ni se cuenta', () => {
    expect(numeraOpciones('El artículo 3 dice que la opción B es la correcta.')).toBe(false);
    expect(corrigeNumeracion('El artículo 3 dice lo que dice.', 0)).toBeNull();
    expect(corrigeNumeracion(null, 0)).toBeNull();
  });

  it('un índice que no es 0, 1 o 2 no se acepta', () => {
    expect(corrigeNumeracion('La opción 0 es la correcta.', 5)).toBeNull();
  });

  it('el resultado no vuelve a numerar opciones y solo cambia el número por la letra', () => {
    const original = 'La opción correcta es la 0 porque sí. La opción 1 es incorrecta. La opción 2 es incorrecta.';
    const r = corrigeNumeracion(original, 0)!;
    expect(numeraOpciones(r.texto)).toBe(false);
    expect(r.texto.replace(/\b[ABC]\b/g, '#')).toBe(original.replace(/\b[012]\b/g, '#'));
    expect(r.cambios).toBe(3);
  });
});
