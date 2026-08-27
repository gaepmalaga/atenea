import { describe, it, expect } from 'vitest';
import {
  groupChunksByReference,
  summarizeChunks,
  type DocumentChunkRow,
} from '../app/lib/documents';

/**
 * EL VISOR DE FRAGMENTOS
 *
 * Hasta P1 se subia un PDF y lo unico que se veia era un numero. Ni de que
 * articulos salian los fragmentos, ni por donde se habia cortado. Esa opacidad
 * es el origen real de la desconfianza con la ingesta, y la agrupacion y el
 * resumen son lo que la cura, asi que conviene que no mientan.
 */

const frag = (id: number, reference: string | null, texto: string): DocumentChunkRow => ({
  id,
  reference,
  content_chunk: texto,
});

describe('groupChunksByReference', () => {
  it('junta los fragmentos seguidos del mismo articulo', () => {
    const grupos = groupChunksByReference([
      frag(1, 'Artículo 1', 'uno a'),
      frag(2, 'Artículo 1', 'uno b'),
      frag(3, 'Artículo 2', 'dos'),
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos[0].reference).toBe('Artículo 1');
    expect(grupos[0].chunks).toHaveLength(2);
    expect(grupos[1].chunks).toHaveLength(1);
  });

  it('agrupa CONSECUTIVOS, no todos los que compartan referencia', () => {
    // Si el mismo articulo reaparece separado, es que algo esta fuera de sitio.
    // El visor tiene que enseñarlo, no disimularlo juntandolo todo.
    const grupos = groupChunksByReference([
      frag(1, 'Artículo 1', 'a'),
      frag(2, 'Artículo 2', 'b'),
      frag(3, 'Artículo 1', 'c'),
    ]);

    expect(grupos.map((g) => g.reference)).toEqual(['Artículo 1', 'Artículo 2', 'Artículo 1']);
  });

  it('el texto sin articulo forma su propio grupo', () => {
    // El preambulo de una ley no sale de ningun articulo: 59 de los 177
    // fragmentos de la LOFCS son exactamente eso.
    const grupos = groupChunksByReference([
      frag(1, null, 'preambulo a'),
      frag(2, null, 'preambulo b'),
      frag(3, 'Artículo primero', 'el articulo'),
    ]);

    expect(grupos[0].reference).toBeNull();
    expect(grupos[0].chunks).toHaveLength(2);
    expect(grupos[1].reference).toBe('Artículo primero');
  });

  it('sin fragmentos no hay grupos', () => {
    expect(groupChunksByReference([])).toEqual([]);
  });
});

describe('summarizeChunks', () => {
  const muestra = [
    frag(1, null, 'preambulo'),
    frag(2, 'Artículo 1', 'x'.repeat(900)),
    frag(3, 'Artículo 1', 'y'.repeat(300)),
    frag(4, 'Artículo 2', 'z'),
  ];

  it('cuenta fragmentos, cuantos traen articulo y cuantos articulos distintos', () => {
    const r = summarizeChunks(muestra);
    expect(r.total).toBe(4);
    // Tres traen referencia; el preambulo no.
    expect(r.conReferencia).toBe(3);
    // Pero solo hay DOS articulos distintos: el 1 aparece dos veces.
    expect(r.referenciasDistintas).toBe(2);
  });

  it('mide el fragmento mas largo, que es el que delata un troceado malo', () => {
    expect(summarizeChunks(muestra).maxCaracteres).toBe(900);
  });

  it('suma los caracteres de todos', () => {
    expect(summarizeChunks(muestra).caracteres).toBe('preambulo'.length + 900 + 300 + 1);
  });

  it('una referencia en blanco no cuenta como referencia', () => {
    // Si contara, el visor diria que el documento tiene estructura legal
    // cuando no la tiene.
    const r = summarizeChunks([frag(1, '   ', 'a'), frag(2, '', 'b')]);
    expect(r.conReferencia).toBe(0);
    expect(r.referenciasDistintas).toBe(0);
  });

  it('sin fragmentos devuelve ceros, no NaN', () => {
    // `Math.max()` sin argumentos es -Infinity: por eso el maximo se calcula
    // recorriendo y no con un spread.
    const r = summarizeChunks([]);
    expect(r).toEqual({
      total: 0,
      conReferencia: 0,
      referenciasDistintas: 0,
      caracteres: 0,
      maxCaracteres: 0,
    });
  });
});
