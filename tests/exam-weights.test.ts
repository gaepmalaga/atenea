import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extraeTemasDeExamenReal, cuentaPorTema } from '../app/lib/exam-weights';

/**
 * PESO REAL DEL EXAMEN, SACADO DE LOS EXÁMENES OFICIALES YA INDEXADOS
 * (regla 72/73). Los PDF «resueltos y desarrollados» etiquetan cada
 * pregunta con «Tema N · Título» — un patrón de texto, no algo que haga
 * falta pedirle a un modelo.
 */

const FRAGMENTO = `
1. En el caso de nacimiento fuera de un centro hospitalario cuanto tiempo se dispone para declarar el nacimiento en el Registro Civil:
A)72 horas. B)7 días. ✔10 días. POR QUÉ
Cuando el nacimiento se produce fuera de un centro hospitalario... Tema 5 · El Gobierno y la Administración
2. Según el art. 26 del Código Civil, indique cuál de los siguientes es un requisito para recuperar la nacionalidad española:
A)Entrar voluntariamente... ✔Declarar ante el encargado del Registro Civil... POR QUÉ
Conforme al artículo 26 del Código Civil... Tema 1 · El Derecho
3. La Constitución Española recoge en su articulado el derecho a la propiedad privada:
A)Derechos fundamentales... ✔Derechos y deberes... POR QUÉ
Conforme al artículo 33... Tema 1 · El Derecho
`;

describe('extraeTemasDeExamenReal', () => {
  it('extrae un numero de tema por cada pregunta etiquetada', () => {
    expect(extraeTemasDeExamenReal(FRAGMENTO)).toEqual([5, 1, 1]);
  });

  it('un texto sin el patron da una lista vacia', () => {
    expect(extraeTemasDeExamenReal('texto cualquiera sin nada')).toEqual([]);
    expect(extraeTemasDeExamenReal('')).toEqual([]);
  });

  it('ignora un numero de tema fuera de rango (1-45), que seria ruido de OCR', () => {
    expect(extraeTemasDeExamenReal('Tema 99 · Inventado')).toEqual([]);
    expect(extraeTemasDeExamenReal('Tema 0 · Tampoco')).toEqual([]);
  });

  it('funciona con el espaciado exacto del PDF real (espacio antes del punto medio)', () => {
    expect(extraeTemasDeExamenReal('...distractores típicos.  Tema 5 · La Unión Europea')).toEqual([5]);
  });
});

describe('cuentaPorTema', () => {
  it('suma ocurrencias de una sola lista', () => {
    expect(cuentaPorTema([1, 1, 5])).toEqual({ 1: 2, 5: 1 });
  });

  it('suma varias listas a la vez (varios examenes)', () => {
    expect(cuentaPorTema([1, 5], [1, 1], [5])).toEqual({ 1: 3, 5: 2 });
  });

  it('sin listas, o listas vacias, da un objeto vacio', () => {
    expect(cuentaPorTema()).toEqual({});
    expect(cuentaPorTema([], [])).toEqual({});
  });
});

describe('contra los 5 examenes reales de verdad (si estan disponibles en local)', () => {
  // Estos ficheros no viven en el repo (son 76KB x 5 de texto de documentos.
  // full_text, no algo que se comitee) — el test se salta con gracia si no
  // los encuentra. Sirve para volver a comprobar el patron si el guion de
  // extraccion (`scripts/operacion/calcular-pesos-examenes.mjs`) se toca.
  it('el patron sigue casando con >= 95% de las 100 preguntas por examen', () => {
    const dir = join(__dirname, 'fixtures', 'examenes-reales');
    let algunFichero = false;
    for (const anio of [2021, 2022, 2023, 2024, 2025]) {
      const ruta = join(dir, `${anio}.txt`);
      let texto: string;
      try {
        texto = readFileSync(ruta, 'utf-8');
      } catch {
        continue;
      }
      algunFichero = true;
      const temas = extraeTemasDeExamenReal(texto);
      expect(temas.length).toBeGreaterThanOrEqual(95);
    }
    if (!algunFichero) {
      // No hay fixtures locales: no es un fallo, es que no se han volcado.
      expect(true).toBe(true);
    }
  });
});
