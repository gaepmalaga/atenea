import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNA_SOLA_ACADEMIA, puedeEditarBanco, filtroEscrituraBanco, puedeEditarFilaVisible } from '../app/lib/permisos-banco';

/** Regla 123: quién puede tocar una pregunta del banco. */

const ORG = 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2';
const OTRA = '11111111-2222-3333-4444-555555555555';
const admin = { role: 'admin', organizationId: ORG };
const global = { organization_id: null };
const propia = { organization_id: ORG };
const ajena = { organization_id: OTRA };

describe('puedeEditarBanco', () => {
  it('el superadmin edita todo', () => {
    const su = { role: 'superadmin', organizationId: null };
    for (const f of [global, propia, ajena]) expect(puedeEditarBanco(su, f, true)).toBe(true);
    for (const f of [global, propia, ajena]) expect(puedeEditarBanco(su, f, false)).toBe(true);
  });

  it('el admin edita lo suyo, siempre', () => {
    expect(puedeEditarBanco(admin, propia, true)).toBe(true);
    expect(puedeEditarBanco(admin, propia, false)).toBe(true);
  });

  it('con una sola academia, el admin edita también el banco global', () => {
    expect(puedeEditarBanco(admin, global, true)).toBe(true);
  });

  it('con el interruptor en `false` vuelve la regla 75: el global no es del admin', () => {
    expect(puedeEditarBanco(admin, global, false)).toBe(false);
  });

  it('el banco de OTRA academia no lo edita nadie que no sea superadmin, con o sin interruptor', () => {
    expect(puedeEditarBanco(admin, ajena, true)).toBe(false);
    expect(puedeEditarBanco(admin, ajena, false)).toBe(false);
  });

  it('un alumno no edita nada, ni un admin sin academia', () => {
    for (const f of [global, propia, ajena]) {
      expect(puedeEditarBanco({ role: 'student', organizationId: ORG }, f, true)).toBe(false);
      expect(puedeEditarBanco({ role: 'admin', organizationId: null }, f, true)).toBe(false);
    }
  });

  it('el interruptor está encendido en esta instalación, que es de Alphapol', () => {
    expect(UNA_SOLA_ACADEMIA).toBe(true);
  });
});

describe('filtroEscrituraBanco', () => {
  it('el superadmin no se filtra', () => {
    expect(filtroEscrituraBanco({ role: 'superadmin', organizationId: null }, true)).toBeNull();
  });

  it('el admin: su academia y, con una sola, el global', () => {
    expect(filtroEscrituraBanco(admin, true)).toBe(`organization_id.eq.${ORG},organization_id.is.null`);
    expect(filtroEscrituraBanco(admin, false)).toBe(`organization_id.eq.${ORG}`);
  });

  it('quien no es admin de una academia recibe un filtro que no casa con nada', () => {
    expect(filtroEscrituraBanco({ role: 'student', organizationId: ORG }, true)).toBe('id.is.null');
    expect(filtroEscrituraBanco({ role: 'admin', organizationId: null }, true)).toBe('id.is.null');
  });

  it('el filtro nunca nombra otra academia', () => {
    expect(filtroEscrituraBanco(admin, true)).not.toContain(OTRA);
  });

  it('dice lo mismo que `puedeEditarBanco` (el panel y el servidor no pueden discrepar)', () => {
    for (const unaSola of [true, false]) {
      for (const f of [global, propia, ajena]) {
        const filtro = filtroEscrituraBanco(admin, unaSola)!;
        const casa = filtro.split(',').some((c) => (c === 'organization_id.is.null' ? f.organization_id === null : c === `organization_id.eq.${f.organization_id}`));
        expect(casa, `${unaSola} ${JSON.stringify(f)}`).toBe(puedeEditarBanco(admin, f, unaSola));
      }
    }
  });
});

describe('puedeEditarFilaVisible (el panel)', () => {
  it('superadmin, siempre; admin: una fila con academia es suya, y la global solo con una sola', () => {
    expect(puedeEditarFilaVisible(true, global, false)).toBe(true);
    expect(puedeEditarFilaVisible(false, propia, false)).toBe(true);
    expect(puedeEditarFilaVisible(false, global, true)).toBe(true);
    expect(puedeEditarFilaVisible(false, global, false)).toBe(false);
    expect(puedeEditarFilaVisible(false, {}, false)).toBe(false);
  });
});

describe('lo que el interruptor NO abre', () => {
  const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const accion = (f: string) => quita(readFileSync(join(__dirname, '..', 'app/actions', f), 'utf-8'));

  it('generar con IA, crear academias y crear admins siguen siendo del superadmin', () => {
    expect(accion('superadmin.ts')).toMatch(/export async function addAcademyAdmin[\s\S]*?requireSuperadmin\(\)/);
    expect(accion('superadmin.ts')).toMatch(/export async function createAcademy[\s\S]*?requireSuperadmin\(\)/);
    expect(accion('exams.ts')).toMatch(/requireSuperadmin\(\)/);
  });

  it('«Vaciar banco» no se abre al banco global para el admin', () => {
    const src = accion('moderation.ts');
    const cuerpo = src.slice(src.indexOf('export async function discardAllQuestions'), src.indexOf('export async function resolveReport'));
    expect(cuerpo).toMatch(/\.is\('organization_id', null\)/);
    expect(cuerpo).toMatch(/\.eq\('organization_id', auth\.user\.organizationId\)/);
    expect(cuerpo).not.toMatch(/filtroEscrituraBanco/);
  });
});
