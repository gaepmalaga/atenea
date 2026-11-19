import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  citasDeLaReferencia, citasDeLaPregunta, candidatasPorTema, cabeceraDelTemario, preceptoDelRotulo, preceptoLegible,
  ordinalANumero, cardinalANumero, bloquesDelXml, indicePorPrecepto, cambiosPosteriores, esTextoDerogado,
  avisoDeBloque, avisoDeActoUE, celexDe, eligePorTexto, busquedaBoe, fecha8, agrupaAvisos, NO_VIGILADAS, TIPO_REPORTE_VIGENCIA, separaEnlaceOficial,
  type TemaManifiesto,
} from '../app/lib/normativa';

/**
 * LA VIGILANCIA DE LA NORMATIVA (regla 137).
 *
 * El vigilante solo vale si lee bien las referencias que hay de verdad en el
 * banco: las de abajo están copiadas de él. Y solo es útil si NO avisa de lo
 * que no ha cambiado: un aviso falso por semana y nadie mira la cola.
 */

const raiz = join(__dirname, '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf-8');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const manifiesto = JSON.parse(leer('temario/temario.json')) as { temas: TemaManifiesto[] };
const tema = (n: number) => manifiesto.temas.find((t) => t.numero === n);

describe('citasDeLaReferencia: las referencias del banco', () => {
  const casos: [string, { norma: string | null; precepto: string | null }[]][] = [
    ['Art. 69.3 Ley 40/2015', [{ norma: 'Ley 40/2015', precepto: 'art:69' }]],
    ['DA 11.ª Ley 40/2015', [{ norma: 'Ley 40/2015', precepto: 'da:11' }]],
    // El «bis» va con el apartado: es el artículo 12.
    ['Art. 12.2 bis Ley 50/1997', [{ norma: 'Ley 50/1997', precepto: 'art:12' }]],
    // Aquí el «ter» va con el artículo.
    ['Art. 8 ter.4 RD 207/2024', [{ norma: 'RD 207/2024', precepto: 'art:8ter' }]],
    ['Arts. 8 y 9 CE', [{ norma: 'CE', precepto: 'art:8' }, { norma: 'CE', precepto: 'art:9' }]],
    ['Arts. 12 a 14 LO 4/2010', [12, 13, 14].map((n) => ({ norma: 'LO 4/2010', precepto: `art:${n}` }))],
    // La sigla entre paréntesis es la misma norma: no es otra cita de la norma entera.
    ['Art. 49.a RDLeg 5/2015 (TREBEP)', [{ norma: 'RDLeg 5/2015', precepto: 'art:49' }]],
    ['Art. 5 Ley 39/2015; art. 103.1 CE', [{ norma: 'Ley 39/2015', precepto: 'art:5' }, { norma: 'CE', precepto: 'art:103' }]],
    ['Anexo II Orden INT/430/2014', [{ norma: 'Orden INT/430/2014', precepto: 'anexo:2' }]],
    ['Art. 61.s Ley 40/2015', [{ norma: 'Ley 40/2015', precepto: 'art:61' }]],
    ['Art. 193 CC', [{ norma: 'Código Civil', precepto: 'art:193' }]],
    ['Disposición adicional decimotercera Ley 40/2015', [{ norma: 'Ley 40/2015', precepto: 'da:13' }]],
    ['Reglamento (UE) 2024/1348', [{ norma: 'Reglamento (UE) 2024/1348', precepto: null }]],
    ['Art. 25 Reglamento (CE) 810/2009', [{ norma: 'Reglamento (CE) 810/2009', precepto: 'art:25' }]],
    // Sin ley: la pondrá el tema.
    ['Artículo 2', [{ norma: null, precepto: 'art:2' }]],
    ['Artículo cincuenta y uno', [{ norma: null, precepto: 'art:51' }]],
    ['Disposición final primera', [{ norma: null, precepto: 'df:1' }]],
  ];
  for (const [ref, esperado] of casos) {
    it(ref, () => expect(citasDeLaReferencia(ref)).toEqual(esperado));
  }

  it('una referencia vacía no cita nada', () => {
    expect(citasDeLaReferencia(null)).toEqual([]);
    expect(citasDeLaReferencia('   ')).toEqual([]);
  });

  it('los Tratados se reconocen pero no se vigilan', () => {
    const [cita] = citasDeLaReferencia('Art. 13 TUE');
    expect(cita).toEqual({ norma: 'TUE', precepto: 'art:13' });
    expect(NO_VIGILADAS.has(cita.norma!)).toBe(true);
  });
});

describe('ordinales y rótulos del BOE', () => {
  it('lee los ordinales compuestos y en femenino', () => {
    expect(ordinalANumero('primera')).toBe(1);
    expect(ordinalANumero('undécima')).toBe(11);
    expect(ordinalANumero('decimotercera')).toBe(13);
    expect(ordinalANumero('vigésima primera')).toBe(21);
    expect(ordinalANumero('décimo tercero')).toBe(13);
    expect(ordinalANumero('ley')).toBeNull();
    expect(cardinalANumero('cincuenta y uno')).toBe(51);
  });

  it('saca el precepto del rótulo, no del id del bloque', () => {
    expect(preceptoDelRotulo('Artículo 69')).toBe('art:69');
    expect(preceptoDelRotulo('Art 1')).toBe('art:1'); // así rotula el Código Civil
    expect(preceptoDelRotulo('Artículo primero')).toBe('art:1'); // y así la LOFCS
    expect(preceptoDelRotulo('Artículo 8 ter')).toBe('art:8ter');
    expect(preceptoDelRotulo('Artículo 18.bis')).toBe('art:18bis'); // así rotula la LO 4/2000
    expect(preceptoDelRotulo('Artículo cincuenta y uno')).toBe('art:51'); // y así la LOPJ
    expect(preceptoDelRotulo('Artículo sesenta y cuatro bis')).toBe('art:64bis');
    expect(preceptoDelRotulo('Artículo ciento sesenta y uno ter')).toBe('art:161ter');
    expect(preceptoDelRotulo('Disposición adicional undécima. Conflictos de atribuciones')).toBe('da:11');
    expect(preceptoDelRotulo('Disposición transitoria única')).toBe('dt:unica');
    expect(preceptoDelRotulo('ANEXO II')).toBe('anexo:2');
    expect(preceptoDelRotulo('TÍTULO PRELIMINAR')).toBeNull();
    expect(preceptoDelRotulo(null)).toBeNull();
  });

  it('enseña el precepto como lo lee una persona', () => {
    expect(preceptoLegible('art:69')).toBe('art. 69');
    expect(preceptoLegible('art:8ter')).toBe('art. 8 ter');
    expect(preceptoLegible('da:11')).toBe('disposición adicional 11.ª');
    expect(preceptoLegible('dt:unica')).toBe('disposición transitoria única');
  });
});

describe('la ley por el tema, para las «Artículo N» del temario', () => {
  it('con una sola norma que cubre el artículo, la pone', () => {
    // Tema 3: la Constitución, arts. 56 a 169.
    const [cita] = citasDeLaPregunta('Artículo 68', tema(3));
    expect(cita).toMatchObject({ boe: 'BOE-A-1978-31229', precepto: 'art:68', origen: 'tema' });
  });

  it('si dos normas del tema tienen ese artículo, no adivina', () => {
    // Tema 5: Ley 40/2015 (arts. 1-4 y 54-68) y Ley 50/1997 (arts. 1-21).
    const [cita] = citasDeLaPregunta('Artículo 3', tema(5));
    expect(cita.boe).toBeNull();
    expect(cita.candidatas?.map((c) => c.boe).sort()).toEqual(['BOE-A-1997-25336', 'BOE-A-2015-10566']);
    // El 60 solo lo cubre la Ley 40/2015.
    expect(citasDeLaPregunta('Artículo 60', tema(5))[0].boe).toBe('BOE-A-2015-10566');
  });

  it('la parte del temario de la que salió la pregunta acota las normas', () => {
    // Tema 8 entero: Orden INT/859/2023 y LO 4/2010 son «completas», así que cualquier artículo es de las dos.
    expect(candidatasPorTema(tema(8), 'art:41').length).toBeGreaterThan(1);
    // La parte 1 no lleva la LO 4/2010.
    const parte1 = cabeceraDelTemario(leer('temario/md/tema-08-1.md'));
    expect(parte1.boes).toContain('BOE-A-2023-17072');
    expect(parte1.boes).not.toContain('BOE-A-2010-8115');
    expect(candidatasPorTema(tema(8), 'art:41', parte1.boes).map((c) => c.boe)).toEqual(['BOE-A-2023-17072']);
  });

  it('la fecha de una parte del temario es la de su generación', () => {
    expect(cabeceraDelTemario(leer('temario/md/tema-08-1.md')).generado).toBe('20260903');
  });

  it('los rangos del manifiesto por id de bloque («a588bisa») cuentan el artículo', () => {
    // Tema 20: la LECrim, de «a588bisa» a «a588octies».
    expect(citasDeLaPregunta('Artículo 588 ter', tema(20))[0].boe).toBe('BOE-A-1882-6036');
  });

  it('entre dos normas posibles, elige la que nombra la explicación, y solo si nombra una', () => {
    const cands = [{ boe: 'BOE-A-2015-8468', nombre: 'LO 9/2015' }, { boe: 'BOE-A-2010-8115', nombre: 'LO 4/2010' }];
    expect(eligePorTexto(cands, 'Según el artículo 15 de la Ley Orgánica 9/2015, de Régimen de Personal…')?.boe).toBe('BOE-A-2015-8468');
    expect(eligePorTexto(cands, 'La LO 4/2010 y la LO 9/2015 lo regulan.')).toBeNull();
    expect(eligePorTexto(cands, 'El artículo lo dice claramente.')).toBeNull();
  });

  it('si la referencia dice la ley, manda la referencia y no el tema', () => {
    expect(citasDeLaPregunta('Art. 9.3 CE', tema(5))[0]).toMatchObject({ norma: 'CE', boe: 'BOE-A-1978-31229', origen: 'referencia' });
  });
});

const XML = `<?xml version="1.0" encoding="utf-8"?><response><data><texto>
  <bloque id="a68" tipo="precepto" titulo="Artículo 68">
    <version id_norma="BOE-A-2015-10566" fecha_publicacion="20151002" fecha_vigencia="20161002"><p class="articulo">Artículo 68.</p><p class="parrafo">Texto de siempre.</p></version>
  </bloque>
  <bloque id="a69" tipo="precepto" titulo="Artículo 69">
    <version id_norma="BOE-A-2015-10566" fecha_publicacion="20151002" fecha_vigencia="20161002"><p class="parrafo">1. Texto original.</p></version>
    <version id_norma="BOE-A-2026-111" fecha_publicacion="20261110" fecha_vigencia="20261201"><p class="parrafo">1. Texto nuevo.</p></version>
  </bloque>
  <bloque id="a70" tipo="precepto" titulo="Artículo 70">
    <version id_norma="BOE-A-2015-10566" fecha_publicacion="20151002" fecha_vigencia="20161002"><p class="parrafo">Texto.</p></version>
    <version id_norma="BOE-A-2025-9" fecha_publicacion="20250301" fecha_vigencia="20250302"><p class="articulo">Artículo 70.</p><p class="parrafo">(Derogado)</p></version>
  </bloque>
  <bloque id="a69bis" tipo="precepto" titulo="Artículo 69&#160;bis">
    <version id_norma="BOE-A-2015-10566" fecha_publicacion="20151002" fecha_vigencia="20161002"><p class="parrafo">Texto.</p></version>
  </bloque>
  <bloque id="preambulo" tipo="preambulo">
    <version id_norma="BOE-A-2015-10566" fecha_publicacion="20151002" fecha_vigencia="20161002"><p class="parrafo">I</p></version>
  </bloque>
  <bloque id="ti" tipo="encabezado" titulo="TÍTULO I"><version id_norma="BOE-A-2015-10566" fecha_publicacion="20151002" fecha_vigencia="20161002"></version></bloque>
</texto></data></response>`;

describe('el texto consolidado y lo que cambia después de la pregunta', () => {
  const bloques = bloquesDelXml(XML);
  const indice = indicePorPrecepto(bloques);

  it('indexa los preceptos por su rótulo y deja fuera los títulos', () => {
    // El 69 bis llega con el espacio como entidad (&#160;): no puede leerse como el 69.
    // El preámbulo no tiene rótulo, solo tipo.
    expect([...indice.keys()]).toEqual(['art:68', 'art:69', 'art:70', 'art:69bis', 'preambulo']);
    expect(indice.get('art:69')!.versiones).toHaveLength(2);
  });

  it('la versión original nunca es un cambio', () => {
    expect(cambiosPosteriores(indice.get('art:68')!, '20100101')).toEqual([]);
  });

  it('avisa de una reforma posterior a la pregunta, aunque aún no esté en vigor', () => {
    const cambios = cambiosPosteriores(indice.get('art:69')!, '20260903');
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ norma: 'BOE-A-2026-111', vigencia: '20261201' });
  });

  it('no avisa si la pregunta ya es posterior a la reforma', () => {
    expect(cambiosPosteriores(indice.get('art:69')!, '20261202')).toEqual([]);
  });

  it('reconoce un artículo que se queda vacío, y no confunde un artículo largo que habla de derogar', () => {
    const [v] = cambiosPosteriores(indice.get('art:70')!, '20240101');
    expect(esTextoDerogado(v.texto ?? '')).toBe(true);
    expect(esTextoDerogado('(Sin contenido)')).toBe(true);
    expect(esTextoDerogado('1. Quedan derogadas cuantas disposiciones de igual o inferior rango se opongan a lo establecido en esta ley, y en particular las normas que regulaban el procedimiento sancionador anterior y su reglamento de desarrollo.')).toBe(false);
  });
});

describe('el aviso', () => {
  afterEach(() => vi.useRealTimers());

  const datos = {
    norma: 'Ley 40/2015', precepto: 'art:69', boe: 'BOE-A-2015-10566', bloque: 'a69',
    version: { norma: 'BOE-A-2026-111', publicacion: '20261110', vigencia: '20261201' },
  };

  it('dice qué, desde cuándo, quién lo cambia y lleva el enlace al artículo', () => {
    const m = avisoDeBloque(datos);
    expect(m).toContain('Ley 40/2015, art. 69');
    expect(m).toContain('1/12/2026');
    expect(m).toContain('BOE-A-2026-111');
    expect(m).toContain('https://www.boe.es/buscar/act.php?id=BOE-A-2015-10566#a69');
  });

  it('es determinista: es la llave para no repetirlo, así que no puede depender del día', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T08:00:00Z'));
    const antes = [avisoDeBloque(datos), avisoDeActoUE({ norma: 'Reglamento (UE) 2016/399', modificador: '32024R1717', fecha: '2024-06-13' })];
    vi.setSystemTime(new Date('2027-03-01T08:00:00Z'));
    const despues = [avisoDeBloque(datos), avisoDeActoUE({ norma: 'Reglamento (UE) 2016/399', modificador: '32024R1717', fecha: '2024-06-13' })];
    expect(despues).toEqual(antes);
  });

  it('se agrupa por precepto para el resumen', () => {
    expect(agrupaAvisos([{ clave: 'CE, art. 49' }, { clave: 'CP, art. 234' }, { clave: 'CE, art. 49' }])).toEqual([
      { clave: 'CE, art. 49', n: 2 }, { clave: 'CP, art. 234', n: 1 },
    ]);
  });

  it('fecha8 pasa una fecha ISO al formato del BOE', () => {
    expect(fecha8('2026-11-19T20:12:00+00:00')).toBe('20261119');
    expect(fecha8(null)).toBeNull();
  });
});

describe('cómo se busca cada norma en su fuente', () => {
  it('BOE: por rango y número oficial', () => {
    expect(busquedaBoe('LO 4/2000')).toEqual({ rango: 'Ley Orgánica', numero: '4/2000' });
    expect(busquedaBoe('RD 1155/2024')).toEqual({ rango: 'Real Decreto', numero: '1155/2024' });
    expect(busquedaBoe('Orden INT/859/2023')).toEqual({ rango: 'Orden', numero: 'INT/859/2023' });
    expect(busquedaBoe('CE')).toBeNull();
  });

  it('UE: el CELEX, con la numeración de antes y después de 2015', () => {
    expect(celexDe('Reglamento (UE) 2024/1348')).toBe('32024R1348');
    expect(celexDe('Reglamento (UE) 2016/399')).toBe('32016R0399');
    expect(celexDe('Reglamento (CE) 810/2009')).toBe('32009R0810');
    expect(celexDe('Directiva (UE) 2016/680')).toBe('32016L0680');
    expect(celexDe('Directiva 2008/115/CE')).toBe('32008L0115');
    expect(celexDe('Ley 40/2015')).toBeNull();
  });
});

describe('el guion y los flujos', () => {
  const guion = sinComentarios(leer('scripts/operacion/vigilar-normativa.mjs'));
  const flujo = leer('.github/workflows/vigilancia-normativa.yml');
  const operacion = leer('.github/workflows/operacion.yml');

  it('no toca ninguna pregunta: solo lee el banco y escribe avisos', () => {
    expect(guion).not.toMatch(/from\('question_bank'\)[\s\S]{0,200}?\.(update|delete|upsert|insert)\(/);
    const escrituras = [...guion.matchAll(/from\('([a-z_]+)'\)\s*\.(insert|update|delete|upsert)\(/g)].map((m) => m[1]);
    expect(escrituras).toEqual(['question_reports']);
    expect(guion).toContain('TIPO_REPORTE_VIGENCIA');
    expect(TIPO_REPORTE_VIGENCIA).toBe('vigencia');
  });

  it('usa la lógica de app/lib y no una copia', () => {
    for (const pieza of ['citasDeLaPregunta', 'bloquesDelXml', 'cambiosPosteriores', 'avisoDeBloque', 'plantillaCambiosNormativa']) {
      expect(guion, pieza).toContain(pieza);
    }
  });

  it('pagina lo que lee (regla 74) y no repite avisos', () => {
    expect(guion).toMatch(/\.order\('id'\)\.range\(d, h\)/);
    expect(guion).toMatch(/yaAvisado/);
  });

  it('cada petición al BOE o a la UE tiene tope de tiempo', () => {
    // Las del BOE y Cellar pasan todas por `pedir`; el correo va aparte.
    expect(guion).toMatch(/async function pedir[\s\S]{0,400}signal: AbortSignal\.timeout\(/);
    const fetches = [...guion.matchAll(/await fetch\((?!'https:\/\/api\.resend\.com)/g)];
    expect(fetches).toHaveLength(1);
  });

  it('solo escribe con --hazlo y con tope', () => {
    expect(guion).toMatch(/if \(!HAZLO\)[\s\S]{0,120}process\.exit\(0\)/);
    expect(guion).toMatch(/nuevos\.length > MAXIMO/);
  });

  it('el flujo programado escribe; el ensayo de Operación no', () => {
    expect(flujo).toMatch(/cron:/);
    expect(flujo).toContain('npm run normativa -- --hazlo');
    const ensayo = /inputs\.accion == 'normativa-ensayo'[\s\S]*?\n\s*run: (.+)/.exec(operacion);
    expect(ensayo?.[1].trim()).toBe('npm run normativa -- ${DESDE:+--desde=$DESDE}');
    expect(ensayo?.[1]).not.toContain('--hazlo');
    // La fecha del formulario no se pega en la orden de shell.
    expect(operacion).not.toMatch(/run: npm run normativa[^\n]*inputs\.desde/);
  });
});

describe('el aviso en «Moderación»', () => {
  const moderacion = sinComentarios(leer('app/components/Admin/components/AdminModeration.tsx'));

  it('separa el enlace oficial del texto, y solo si es del BOE o de EUR-Lex', () => {
    const m = 'Ley 40/2015, art. 69: nueva redacción… https://www.boe.es/buscar/act.php?id=BOE-A-2015-10566#a69';
    expect(separaEnlaceOficial(m)).toEqual({ texto: 'Ley 40/2015, art. 69: nueva redacción…', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-10566#a69', fuente: 'BOE' });
    expect(separaEnlaceOficial('mira https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32024R1717').fuente).toBe('EUR-Lex');
    // Un enlace cualquiera no se convierte en enlace.
    expect(separaEnlaceOficial('pincha aquí https://ejemplo.com/x')).toEqual({ texto: 'pincha aquí https://ejemplo.com/x', url: null, fuente: null });
  });

  it('tiene su etiqueta, y el enlace solo se pinta en los avisos de la ley, no en las quejas de alumnos', () => {
    expect(moderacion).toMatch(/\[TIPO_REPORTE_VIGENCIA\]:\s*\{\s*label: 'Cambio en la ley'/);
    expect(moderacion).toMatch(/const aviso = deLaLey \? separaEnlaceOficial\(r\.message\) : null/);
    expect(moderacion).toMatch(/href=\{aviso\.url\}/);
    expect(moderacion).not.toMatch(/href=\{r\.message/);
  });

  it('corregir la pregunta desde el aviso lo archiva', () => {
    expect(moderacion).toMatch(/reportContext\?\.report_type === TIPO_REPORTE_VIGENCIA\) await handleResolveReport\(reportContext\.id\)/);
  });
});
