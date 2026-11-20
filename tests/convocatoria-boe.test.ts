import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  itemsDelSumario, esDeEscalaBasicaPolicia, esOfertaDeEmpleoPublico, claseDelTitulo, halladosEnElDia,
  existeAviso, marcaDeAviso, novedadDeHallazgo, ultimosDias, TIPO_NOVEDAD_CONVOCATORIA,
} from '../app/lib/convocatoria-boe';

const raiz = join(__dirname, '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf-8');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const CONVOCA = 'Resolución de 7 de julio de 2026, de la Dirección General de la Policía, por la que se convoca proceso selectivo para ingreso, por oposición libre, en la Escala Básica, categoría de Policía, del Cuerpo Nacional de Policía.';
const ADMITIDOS = 'Resolución de 5 de agosto de 2026, de la Dirección General de la Policía, por la que se aprueba la lista provisional de admitidos y excluidos al proceso selectivo para ingreso en la Escala Básica del Cuerpo Nacional de Policía.';

/** La forma del sumario del BOE: un objeto donde hay uno, una lista donde hay varios, `item` con o sin `epigrafe`. */
const SUMARIO = {
  status: { code: '200' },
  data: {
    sumario: {
      diario: [{
        seccion: [
          {
            codigo: '2B',
            departamento: [
              { nombre: 'MINISTERIO DEL INTERIOR', epigrafe: { nombre: 'Cuerpo Nacional de Policía', item: { identificador: 'BOE-A-2026-15055', titulo: CONVOCA, url_pdf: 'https://www.boe.es/pdf/15055.pdf', url_html: 'https://www.boe.es/h/15055' } } },
              { nombre: 'MINISTERIO DE DEFENSA', item: [{ identificador: 'BOE-A-2026-15056', titulo: 'Resolución por la que se convoca proceso selectivo, Escala Básica de la Guardia Civil.' }] },
            ],
          },
          { codigo: '3', departamento: { nombre: 'MINISTERIO DE HACIENDA', epigrafe: [{ nombre: 'x', item: [{ identificador: 'BOE-A-2026-15057', titulo: 'Real Decreto 1/2027, por el que se aprueba la oferta de empleo público para el año 2027.' }] }] } },
        ],
      }],
    },
  },
};

describe('leer el sumario del BOE', () => {
  it('recoge cada disposición con su departamento, sea cual sea la forma del árbol', () => {
    const items = itemsDelSumario(SUMARIO);
    expect(items.map((i) => i.id)).toEqual(['BOE-A-2026-15055', 'BOE-A-2026-15056', 'BOE-A-2026-15057']);
    expect(items[0].departamento).toBe('MINISTERIO DEL INTERIOR');
    expect(items[1].departamento).toBe('MINISTERIO DE DEFENSA');
    expect(items[2].departamento).toBe('MINISTERIO DE HACIENDA');
    expect(items[0].urlHtml).toBe('https://www.boe.es/h/15055');
  });

  it('no inventa nada con basura, y no repite una disposición', () => {
    expect(itemsDelSumario(null)).toEqual([]);
    expect(itemsDelSumario({ a: [1, 'x', { identificador: 'no-es-boe', titulo: 't' }] })).toEqual([]);
    const dup = { x: [{ identificador: 'BOE-A-2026-1', titulo: 'a' }, { identificador: 'BOE-A-2026-1', titulo: 'a' }] };
    expect(itemsDelSumario(dup)).toHaveLength(1);
  });
});

describe('reconocer la oposición', () => {
  it('exige la escala Y el cuerpo: la Guardia Civil y los destinos sueltos no valen', () => {
    expect(esDeEscalaBasicaPolicia(CONVOCA)).toBe(true);
    expect(esDeEscalaBasicaPolicia(ADMITIDOS)).toBe(true);
    expect(esDeEscalaBasicaPolicia('Convoca proceso selectivo, Escala Básica de la Guardia Civil.')).toBe(false);
    expect(esDeEscalaBasicaPolicia('Resolución por la que se destina a un funcionario de la Policía Nacional.')).toBe(false);
    expect(esDeEscalaBasicaPolicia('Escala Ejecutiva del Cuerpo Nacional de Policía')).toBe(false);
  });

  it('distingue las dos ofertas: la del Estado sí, la de una universidad no', () => {
    expect(esOfertaDeEmpleoPublico('Real Decreto 1/2027, por el que se aprueba la oferta de empleo público para el año 2027.')).toBe(true);
    expect(esOfertaDeEmpleoPublico('Resolución de la Universidad de X, oferta de empleo público 2027.')).toBe(false);
    expect(esOfertaDeEmpleoPublico('Oferta de empleo público sin año')).toBe(false);
  });

  it('clasifica el paso del proceso por el título', () => {
    expect(claseDelTitulo(CONVOCA)).toBe('convocatoria');
    expect(claseDelTitulo(ADMITIDOS)).toBe('admitidos');
    expect(claseDelTitulo('por la que se nombra el tribunal calificador de la Escala Básica')).toBe('tribunal');
    expect(claseDelTitulo('por la que se hace pública la fecha, lugar y hora del primer ejercicio de la Escala Básica')).toBe('fecha');
    expect(claseDelTitulo('relación de aprobados del primer ejercicio, Escala Básica')).toBe('resultados');
    expect(claseDelTitulo('algo distinto, Escala Básica')).toBe('otra');
  });

  it('del sumario del día solo saca lo que toca, con su clase', () => {
    const hallados = halladosEnElDia(itemsDelSumario(SUMARIO), '20260710');
    expect(hallados.map((h) => [h.id, h.clase])).toEqual([['BOE-A-2026-15055', 'convocatoria'], ['BOE-A-2026-15057', 'oferta']]);
  });
});

describe('no repetir el aviso', () => {
  it('la marca del identificador en el detalle basta, y no confunde números parecidos', () => {
    const [h] = halladosEnElDia(itemsDelSumario(SUMARIO), '20260710');
    const n = novedadDeHallazgo(h);
    expect(n.tipo).toBe(TIPO_NOVEDAD_CONVOCATORIA);
    expect(n.detalle).toContain(marcaDeAviso('BOE-A-2026-15055'));
    expect(n.detalle).toContain('https://www.boe.es/h/15055');
    expect(existeAviso([n.detalle], 'BOE-A-2026-15055')).toBe(true);
    expect(existeAviso([n.detalle], 'BOE-A-2026-1505')).toBe(false);
    expect(existeAviso([], 'BOE-A-2026-15055')).toBe(false);
  });

  it('el título de la novedad no se pasa de largo', () => {
    const [h] = halladosEnElDia(itemsDelSumario(SUMARIO), '20260710');
    expect(novedadDeHallazgo({ ...h, titulo: CONVOCA + ' ' + 'x'.repeat(400) }).titulo.length).toBeLessThan(220);
  });
});

describe('los días a mirar', () => {
  it('cuenta hacia atrás hasta hoy, con el más viejo primero y con tope', () => {
    expect(ultimosDias(3, new Date(Date.UTC(2026, 10, 20)))).toEqual(['20261118', '20261119', '20261120']);
    expect(ultimosDias(2, new Date(Date.UTC(2027, 0, 1)))).toEqual(['20261231', '20270101']);
    expect(ultimosDias(500, new Date(Date.UTC(2026, 10, 20)))).toHaveLength(60);
    expect(ultimosDias(0, new Date(Date.UTC(2026, 10, 20)))).toHaveLength(1);
  });
});

describe('el guion y los flujos', () => {
  const guion = sinComentarios(leer('scripts/operacion/vigilar-convocatoria.mjs'));
  const flujo = leer('.github/workflows/vigilancia-convocatoria.yml');
  const operacion = leer('.github/workflows/operacion.yml');

  it('solo escribe en `novedades`, y nunca en el banco ni en la convocatoria del admin', () => {
    const escrituras = [...guion.matchAll(/from\('([a-z_]+)'\)\s*\.(insert|update|delete|upsert)\(/g)].map((m) => m[1]);
    expect(escrituras).toEqual(['novedades']);
    expect(guion).not.toMatch(/academy_convocatoria|question_bank/);
  });

  it('no escribe sin `--hazlo`', () => {
    expect(guion).toMatch(/if \(HAZLO\) \{[\s\S]*\.insert\(/);
  });

  it('falla si el BOE no contesta, y no repite lo ya avisado', () => {
    expect(guion).toMatch(/if \(cuenta\.conBoe === 0 \|\|/);
    expect(guion).toMatch(/process\.exit\(1\)/);
    expect(guion).toContain('existeAviso');
  });

  it('el flujo corre cada día, con la clave, y la entrada va por el entorno', () => {
    expect(flujo).toMatch(/cron: '\d+ \d+ \* \* \*'/);
    expect(flujo).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(flujo).toContain('DIAS: ${{ inputs.dias }}');
    expect(flujo).not.toMatch(/run:.*\$\{\{ inputs\./);
    expect(flujo).toContain('npm run convocatoria -- --hazlo');
  });

  it('«Operación» tiene el ensayo, y ese NO escribe', () => {
    expect(operacion).toContain('convocatoria-ensayo');
    const paso = operacion.split("inputs.accion == 'convocatoria-ensayo'")[1].split('- name:')[0];
    expect(paso).toContain('npm run convocatoria');
    expect(paso).not.toContain('--hazlo');
  });

  it('el script npm existe', () => {
    expect(JSON.parse(leer('package.json')).scripts.convocatoria).toContain('vigilar-convocatoria.mjs');
  });
});
