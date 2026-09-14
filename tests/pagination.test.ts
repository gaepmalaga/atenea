import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paginaCompleta } from '../app/lib/pagination';

/**
 * PostgREST corta a un tope fijo (hoy 1.000) sin avisar — `Content-Range`
 * dice el total real, pero devuelve `206` como si todo fuera bien. Esto
 * pagina por encima de eso. Encontrado y verificado el 14 sep 2026 contra la
 * BD real (`academy.ts`, `Content-Range: 0-999/1782`).
 */

function fuente(total: number) {
  const filas = Array.from({ length: total }, (_, i) => ({ id: i }));
  return async (desde: number, hasta: number) => ({
    data: filas.slice(desde, hasta + 1),
    error: null,
  });
}

describe('paginaCompleta', () => {
  it('con menos de una página, una sola llamada basta', async () => {
    const { data, error } = await paginaCompleta(fuente(50), { tamanioPagina: 1000 });
    expect(data).toHaveLength(50);
    expect(error).toBeNull();
  });

  it('con más de una página, sigue pidiendo hasta agotarlas', async () => {
    const { data } = await paginaCompleta(fuente(1782), { tamanioPagina: 1000 });
    expect(data).toHaveLength(1782);
    expect(data[0]).toEqual({ id: 0 });
    expect(data[1781]).toEqual({ id: 1781 });
  });

  it('exactamente un múltiplo del tamaño de página no pide una de más', async () => {
    let llamadas = 0;
    const contador = async (desde: number, hasta: number) => {
      llamadas++;
      return fuente(2000)(desde, hasta);
    };
    const { data } = await paginaCompleta(contador, { tamanioPagina: 1000 });
    expect(data).toHaveLength(2000);
    // 2 páginas llenas de 1000 + una tercera vacía que confirma que no hay más.
    expect(llamadas).toBe(3);
  });

  it('respeta el tope máximo de filas, aunque haya más disponibles', async () => {
    const { data } = await paginaCompleta(fuente(5000), { tamanioPagina: 1000, maxFilas: 2000 });
    expect(data).toHaveLength(2000);
  });

  it('un error en cualquier página corta ahí y lo devuelve, sin perder lo ya traído', async () => {
    let llamada = 0;
    const conFallo = async (desde: number, hasta: number) => {
      llamada++;
      if (llamada === 2) return { data: null, error: { message: 'boom' } };
      return fuente(3000)(desde, hasta);
    };
    const { data, error } = await paginaCompleta(conFallo, { tamanioPagina: 1000 });
    expect(data).toHaveLength(1000); // solo la primera página, que sí llegó
    expect(error).toBe('boom');
  });

  it('sin filas, no revienta', async () => {
    const { data, error } = await paginaCompleta(fuente(0));
    expect(data).toEqual([]);
    expect(error).toBeNull();
  });
});

describe('guarda: pagination es puro', () => {
  it('no importa Supabase ni React', () => {
    // Quitar comentarios antes de analizar: citan "Supabase" para explicar
    // el porqué, y eso no cuenta como importarlo (trampa ya documentada en
    // CLAUDE.md — un comentario que cita el patrón cuenta como si fuera
    // código si no se limpia antes).
    const src = readFileSync(join(__dirname, '..', 'app', 'lib', 'pagination.ts'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(src).not.toMatch(/supabase|createClient/i);
    expect(src).not.toMatch(/from ['"]react['"]/);
  });
});
