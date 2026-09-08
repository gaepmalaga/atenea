import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LEER EL ARTÍCULO — la intervención para una pregunta atascada.
 *
 * La lógica de comparación de números de artículo («Artículo 25» vs «Artículo
 * veinticinco») ya la cubre `chat.test.ts` con `numeroDeArticulo`. Aquí solo se
 * vigila el contrato de la acción.
 */

const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'temario.ts'), 'utf-8');

describe('getArticulo', () => {
  it('es del alumno: requireUser, no requireAdmin', () => {
    expect(src).toMatch(/requireUser\(\)/);
    expect(src).not.toMatch(/requireAdmin/);
  });

  it('lee con la clave de servicio (document_chunks tiene RLS y cero políticas)', () => {
    expect(src).toMatch(/supabaseAdmin as supabase/);
    expect(src).toMatch(/\.from\('document_chunks'\)/);
  });

  it('compara el NÚMERO de artículo ya leído, no el texto de la referencia', () => {
    // «Artículo 25» y «Artículo veinticinco» son el mismo artículo (regla 30).
    expect(src).toMatch(/numeroDeArticulo\(f\.reference\)\s*===\s*target/);
  });

  it('sin número de artículo devuelve null, no un error (apuntes sin articulado)', () => {
    expect(src).toMatch(/target === null\) return \{ success: true as const, articulo: null \}/);
  });
});
