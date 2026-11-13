import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (rel: string) => quita(readFileSync(join(__dirname, '..', rel), 'utf-8'));

describe('el panel de administración deja elegir el tema', () => {
  it('la cáscara lo ofrece en escritorio y en el menú móvil', () => {
    const s = leer('app/components/ui/panel/PanelShell.tsx');
    expect(s.match(/<TemaPanel \/>/g)?.length).toBe(2);
  });
  it('usa el mismo tema (clave y funciones) que el alumno', () => {
    const t = leer('app/components/ui/panel/TemaPanel.tsx');
    expect(t).toContain('guardaTema');
    expect(t).toContain('leeTema');
  });
  it('el filtro de Alumnos no llama «grupos» a lo que cuenta alumnos', () => {
    const a = leer('app/components/Admin/components/AdminStudents.tsx');
    expect(a).not.toMatch(/Todos los grupos \(\{alumnos\.length\}\)/);
    expect(a).toContain('Todos los alumnos ({alumnos.length})');
  });
});
