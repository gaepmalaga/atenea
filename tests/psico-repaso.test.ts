import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (rel: string) => quita(readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n'));

const accion = (() => {
  const a = lee('app/actions/psico.ts');
  const i = a.indexOf('export async function getRevisionPsico');
  expect(i).toBeGreaterThan(-1);
  return a.slice(i);
})();

describe('repasar una sesión de psicotécnicos ya entregada', () => {
  it('solo la del propio usuario, ya entregada, y con el módulo encendido', () => {
    expect(accion).toContain('requireUser()');
    expect(accion).toContain("requireModule('psico'");
    expect(accion).toMatch(/\.eq\('user_id', auth\.user\.id\)/);
    expect(accion).toContain('finished_at');
  });
  it('si el generador cambió, no enseña preguntas que ya no son las suyas', () => {
    expect(accion).toMatch(/!esVersionPsico\(fila\.version\)/);
  });
  it('el error no lleva el mensaje de la base de datos al navegador (regla 108)', () => {
    expect(accion).toContain("fallo('getRevisionPsico', error)");
    expect(accion).not.toMatch(/error\.message/);
  });
  it('la pantalla abre el repaso desde cada sesión del historial', () => {
    const c = lee('app/components/student/modules/psico/Psicotecnicos.tsx');
    expect(c).toContain('getRevisionPsico({ id })');
    expect(c).toMatch(/onClick=\{\(\) => repasar\(s\.id\)\}/);
  });
  it('el banco de pruebas tiene la acción falsa', () => {
    expect(lee('.banco-pruebas/acciones-falsas.ts')).toContain('export async function getRevisionPsico');
  });
});

describe('Inicio no enseña enlaces a módulos apagados', () => {
  const h = lee('app/components/student/modules/home/DashboardHome.tsx');
  it.each(['cards', 'stats', 'review', 'test', 'training', 'profile'])('el enlace a «%s» pregunta por el módulo', (m) => {
    expect(h).toContain(`on('${m}')`);
  });
  it('el panel le pasa los módulos', () => {
    expect(lee('app/components/student/StudentDashboard.tsx')).toContain('modulos={modules}');
  });
});
