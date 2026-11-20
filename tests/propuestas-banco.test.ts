import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  quitaTextoProporcionado, hablaDeUnTexto, referenciaCorta, articulosNombrados, claseDePrecepto, deCon,
  normaConArticulo, deLaNorma, palabras, cobertura, mejorArticulo,
} from '../app/lib/propuestas-banco';
import {
  leeVeredicto, promptDeVerificacion, avisoDeVerificacion, costeVerificacion, MAX_TEXTO_ARTICULO, TIPO_REPORTE_REVISION_IA,
} from '../app/lib/verificacion';

/**
 * LO QUE PROPONE CLAUDE Y LO QUE REVISA LA IA (regla 138, fase 2).
 *
 * Nada de esto cambia una pregunta: las mejoras quedan como PROPUESTAS y el
 * repaso contra la ley deja AVISOS. Aquí se vigila que las propuestas digan
 * lo mismo con otras palabras (y nunca se inventen una ley), y que lo que
 * devuelve la IA no se crea sin comprobarlo (regla 10).
 */

const raiz = join(__dirname, '..');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (rel: string) => sinComentarios(readFileSync(join(raiz, rel), 'utf-8'));
const cuerpoDe = (src: string, nombre: string) => {
  const i = src.indexOf(`function ${nombre}(`);
  return src.slice(i, src.indexOf('\n}\n', i));
};

describe('quitar «según el texto proporcionado»', () => {
  const rgc = { norma: 'Reglamento General de Circulación', precepto: 'art:69' };
  const nada = { norma: null, precepto: null };

  it('detecta las variantes, y no lo que no lo es', () => {
    expect(hablaDeUnTexto('Según el texto proporcionado, ¿qué…?')).toBe(true);
    expect(hablaDeUnTexto('De acuerdo con el fragmento facilitado…')).toBe(true);
    expect(hablaDeUnTexto('conforme al texto legal propuesto')).toBe(true);
    expect(hablaDeUnTexto('Según el artículo 69 del Reglamento General de Circulación')).toBe(false);
    expect(hablaDeUnTexto(null)).toBe(false);
  });

  it('con la ley segura, la pone en su sitio', () => {
    expect(quitaTextoProporcionado('Según el texto proporcionado, ¿quién debe ceder el paso?', rgc))
      .toBe('Según el artículo 69 del Reglamento General de Circulación, ¿quién debe ceder el paso?');
    expect(quitaTextoProporcionado('¿Quién debe ceder el paso, según el texto proporcionado?', rgc))
      .toBe('¿Quién debe ceder el paso, según el artículo 69 del Reglamento General de Circulación?');
    expect(quitaTextoProporcionado('De acuerdo con el Artículo 6 del texto proporcionado, ¿qué unidad…?', { norma: 'Orden INT/859/2023', precepto: 'art:6' }))
      .toBe('De acuerdo con el artículo 6 de la Orden INT/859/2023, ¿qué unidad…?');
  });

  it('«el texto proporcionado, que forma parte del Artículo 108,» no deja la coletilla', () => {
    expect(quitaTextoProporcionado('Según el texto proporcionado, que forma parte del Artículo 108, la detección de residuos…', { norma: 'RD 137/1993', precepto: 'art:108' }))
      .toBe('Según el artículo 108 del Real Decreto 137/1993, la detección de residuos…');
  });

  it('sin la ley, quita la frase sin inventar ninguna', () => {
    expect(quitaTextoProporcionado('Según el texto proporcionado, ¿quién debe ceder el paso?', nada)).toBe('¿Quién debe ceder el paso?');
    expect(quitaTextoProporcionado('¿Quién debe ceder el paso, según el texto proporcionado?', nada)).toBe('¿Quién debe ceder el paso?');
    expect(quitaTextoProporcionado('¿Según el texto proporcionado sobre extranjería, quién expide la tarjeta?', nada)).toBe('¿Sobre extranjería, quién expide la tarjeta?');
    const r = quitaTextoProporcionado('Según el apartado 2 del texto proporcionado, el plazo es de tres meses.', nada);
    expect(r).toBe('Según el apartado 2, el plazo es de tres meses.');
  });

  it('si no sabe arreglarla sin tocar el sentido, no propone nada (queda para el tutor)', () => {
    expect(quitaTextoProporcionado('El texto proporcionado menciona tres supuestos: ¿cuál falta?', nada)).toBeNull();
    // Nada que quitar: no hay propuesta.
    expect(quitaTextoProporcionado('¿Quién debe ceder el paso?', rgc)).toBeNull();
  });

  it('nombra cada norma como se dice en una frase', () => {
    expect(normaConArticulo('CE')).toBe('la Constitución');
    expect(normaConArticulo('LO 4/2015')).toBe('la Ley Orgánica 4/2015');
    expect(deLaNorma('Código Penal')).toBe('del Código Penal');
    expect(deLaNorma('Ley 40/2015')).toBe('de la Ley 40/2015');
    expect(normaConArticulo('algo raro')).toBeNull();
  });
});

describe('completar la referencia legal', () => {
  it('la forma corta que ya usa el banco', () => {
    expect(referenciaCorta('RD 1428/2003', 'art:69')).toBe('Art. 69 RD 1428/2003');
    expect(referenciaCorta('Código Penal', 'art:264bis')).toBe('Art. 264 bis Código Penal');
    expect(referenciaCorta('Ley 40/2015', 'da:11')).toBe('DA 11.ª Ley 40/2015');
    expect(referenciaCorta('LO 4/2010', 'dd:unica')).toBe('DD única LO 4/2010');
  });

  it('lee los artículos que nombra una explicación', () => {
    expect(articulosNombrados('El Artículo 64 bis.2 establece… y el art. 12 también')).toEqual(['art:64bis', 'art:12']);
    expect(articulosNombrados(null)).toEqual([]);
    // El que el texto atribuye a otra ley no se reutiliza (una pregunta de Hacienda colada en el tema de violencia de género).
    expect(articulosNombrados('que modifica el artículo 31.1 del Real Decreto 1065/2007')).toEqual([]);
    expect(articulosNombrados('el art. 12 de la Ley 39/2015 y el artículo 5')).toEqual(['art:5']);
  });

  it('una referencia que dice «disposición adicional» no puede acabar en un artículo', () => {
    const da = claseDePrecepto('disposición adicional')!;
    expect(da('da:2')).toBe(true);
    expect(da('art:31')).toBe(false);
    expect(claseDePrecepto('Anexo')!('anexo:I')).toBe(true);
    expect(claseDePrecepto('Preámbulo')!('art:1')).toBe(false);
    expect(claseDePrecepto('')).toBeNull();
    expect(claseDePrecepto(null)).toBeNull();
  });

  it('el motivo se lee bien: «sacado del tema», no «de el tema»', () => {
    expect(deCon('el tema')).toBe('del tema');
    expect(deCon('la referencia')).toBe('de la referencia');
  });

  it('el artículo por el texto solo si destaca de verdad', () => {
    const q = palabras('¿Qué plazo tiene el extranjero para solicitar la renovación de la autorización de residencia?');
    const a = { clave: 'a', palabras: palabras('El extranjero podrá solicitar la renovación de la autorización de residencia en el plazo de sesenta días') };
    const b = { clave: 'b', palabras: palabras('La tarjeta de identidad de extranjero se expedirá en el plazo de un mes') };
    expect(cobertura(q, a.palabras)).toBeGreaterThan(cobertura(q, b.palabras));
    expect(mejorArticulo(q, [a, b])?.clave).toBe('a');
    // Dos casi iguales: ninguno destaca, no se elige.
    expect(mejorArticulo(q, [a, { ...a, clave: 'c' }])).toBeNull();
    // Ninguno llega al mínimo.
    expect(mejorArticulo(q, [b])).toBeNull();
  });
});

describe('el repaso contra la ley (la IA solo avisa)', () => {
  it('lo que devuelve la IA no vale hasta comprobarlo', () => {
    expect(leeVeredicto('{"veredicto":"correcta","correcta":1,"motivo":""}')).toEqual({ veredicto: 'correcta', correcta: 1, motivo: '' });
    expect(leeVeredicto({ veredicto: 'incorrecta', correcta: 2, motivo: 'El apartado 2 da tres meses.' })).toMatchObject({ veredicto: 'incorrecta', correcta: 2 });
    expect(leeVeredicto('no es json')).toBeNull();
    expect(leeVeredicto({ veredicto: 'quizás', correcta: 0, motivo: 'x'.repeat(20) })).toBeNull();
    expect(leeVeredicto({ veredicto: 'incorrecta', correcta: 3, motivo: 'x'.repeat(20) })).toBeNull();
    expect(leeVeredicto({ veredicto: 'incorrecta', correcta: 0.5, motivo: 'x'.repeat(20) })).toBeNull();
    // Una duda sin motivo no le sirve al tutor.
    expect(leeVeredicto({ veredicto: 'dudosa', correcta: -1, motivo: 'no' })).toBeNull();
  });

  it('se le enseña el texto vigente, recortado si es enorme, y la pregunta entera', () => {
    const p = promptDeVerificacion({
      norma: 'Código Penal', precepto: 'art. 138', texto: 'x'.repeat(MAX_TEXTO_ARTICULO + 50),
      pregunta: '¿Qué pena…?', opciones: ['Uno', 'Dos', 'Tres'], correcta: 1, explicacion: null,
    });
    expect(p).toContain('[… recortado]');
    expect(p).toContain('0) Uno');
    expect(p).toContain('MARCADA COMO CORRECTA: 1');
    expect(p).toContain('(sin explicación)');
  });

  it('el aviso dice qué cree la IA, con letras, y que la IA también se equivoca', () => {
    const a = avisoDeVerificacion({ norma: 'RD 1155/2024', precepto: 'art. 126', veredicto: { veredicto: 'incorrecta', correcta: 1, motivo: 'El apartado 2 da tres meses.' }, marcada: 0, url: 'https://www.boe.es/x' });
    expect(a).toMatch(/la correcta sería la B, no la A/);
    expect(a).toMatch(/la IA también se equivoca/);
    expect(a).toMatch(/https:\/\/www\.boe\.es\/x$/);
    const d = avisoDeVerificacion({ norma: 'CE', precepto: 'art. 1', veredicto: { veredicto: 'dudosa', correcta: -1, motivo: 'El texto no habla de esto.' }, marcada: 0, url: null });
    expect(d).toMatch(/no puede confirmar/);
  });

  it('el coste se calcula por arriba antes de gastar', () => {
    expect(costeVerificacion(0)).toBe(0);
    expect(costeVerificacion(4000)).toBeGreaterThan(3);
    expect(costeVerificacion(4000)).toBeLessThan(5);
  });
});

describe('nada de esto toca una pregunta (regla 138)', () => {
  const mejoras = leer('scripts/operacion/proponer-mejoras.mjs');
  const verificar = leer('scripts/operacion/verificar-preguntas.mjs');
  const moderacion = leer('app/actions/moderation.ts');
  const revisor = leer('app/components/Admin/components/AdminRevision.tsx');
  const revision = leer('app/actions/revision.ts');

  it('las mejoras de Claude solo dejan propuestas, como «claude»', () => {
    expect(mejoras).not.toMatch(/from\('question_bank'\)\s*\.(update|upsert|insert|delete)/);
    expect(mejoras).toMatch(/proponer\(db, propuestas, \{\s*fuente: 'claude'/);
    expect(mejoras).toMatch(/if \(!HAZLO\)[^\n]*process\.exit\(0\)/);
  });

  it('una ley DEDUCIDA (del tema o de la explicación) solo vale si la pregunta se parece al artículo', () => {
    const citas = leer('scripts/operacion/citas-banco.mjs');
    expect(citas).toMatch(/if \(c\.como !== 'la referencia' && parecido < PARECIDO_MINIMO\)[^\n]*return null;/);
    // Las dos herramientas usan la cita comprobada, no la deducción a secas.
    expect(mejoras).toMatch(/ctx\.citaDe\(q\)/);
    expect(verificar).toMatch(/ctx\.citaDe\(q\)/);
  });

  it('el repaso de la IA solo deja avisos «La IA duda», y solo de las que no cuadran', () => {
    expect(verificar).not.toMatch(/from\('question_bank'\)\s*\.(update|upsert|insert|delete)/);
    expect(verificar).toMatch(/report_type: TIPO_REPORTE_REVISION_IA/);
    expect(verificar).toMatch(/if \(v\.veredicto !== 'correcta'\) porEscribir\.push\(aviso\(/);
    // Con --hazlo se guarda según avanza; sin él, nada.
    expect(verificar).toMatch(/if \(!HAZLO \|\|/);
    expect(verificar).toMatch(/leeVeredicto\(/);
    expect(verificar).toMatch(/if \(!HAZLO\)[^\n]*process\.exit\(0\)/);
    expect(TIPO_REPORTE_REVISION_IA).toBe('revision_ia');
  });

  it('aprobar un cambio no da la pregunta por revisada: eso es verla entera', () => {
    expect(cuerpoDe(moderacion, 'aprobarPropuesta')).not.toMatch(/revisadaPor\(/);
  });

  it('el revisor enseña el cambio propuesto y no deja darla por buena sin decidirlo', () => {
    expect(revision).toMatch(/from\('question_proposals'\)\.select\('id, source, reason, before, after'\)/);
    expect(revisor).toMatch(/const bloqueada = [^\n]*!!p\.propuesta/);
    expect(revisor).toMatch(/aprobarPropuesta\(p\.propuesta\.id\)/);
    expect(revisor).toMatch(/rechazarPropuesta\(p\.propuesta\.id, nota\)/);
  });
});
