import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardas estaticas sobre el render.
 *
 * `StatsPanel` y `DashboardHome` llamaban a `.replace()` sobre una columna que
 * `test_results` no tiene. Con un solo resultado guardado, la excepcion dejaba
 * la pantalla entera en blanco: sin Error Boundary no habia ni menu al que volver.
 */

const COMPONENTS = join(__dirname, '..', 'app', 'components');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

const files = walk(COMPONENTS).map((path) => ({
  name: path.slice(path.indexOf('app/components')),
  src: readFileSync(path, 'utf-8'),
}));

describe('llamadas a metodos sobre datos de la BD', () => {
  it('ningun componente llama a .replace() sobre un campo sin proteger', () => {
    // `item.question_text.replace(...)` revienta si la columna llega null o
    // no existe. Debe pasar antes por `?? ...` o por `?.`.
    const culpables: string[] = [];
    for (const f of files) {
      // item.campo.replace( ... sin ?. ni un ?? por delante
      const re = /(?<![?)\s])\.(\w+)\.replace\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.src))) {
        const line = f.src.slice(0, m.index).split('\n').length;
        culpables.push(`${f.name}:${line} .${m[1]}.replace(`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it('ninguna fecha se construye sin comprobar que existe', () => {
    // `new Date(undefined).toLocaleDateString()` da "Invalid Date" en pantalla.
    const culpables: string[] = [];
    for (const f of files) {
      const re = /new Date\((\w+)\.created_at\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.src))) {
        const before = f.src.slice(Math.max(0, m.index - 120), m.index);
        if (!before.includes('created_at ?')) {
          const line = f.src.slice(0, m.index).split('\n').length;
          culpables.push(`${f.name}:${line}`);
        }
      }
    }
    expect(culpables).toEqual([]);
  });
});

describe('aislamiento de fallos', () => {
  const dashboard = files.find((f) => f.name.endsWith('StudentDashboard.tsx'))!;
  const adminView = files.find((f) => f.name.endsWith('AdminView.tsx'))!;

  it('existe el componente de aislamiento', () => {
    expect(files.some((f) => f.name.endsWith('ModuleErrorBoundary.tsx'))).toBe(true);
  });

  it('cada modulo del alumno va dentro de un ModuleErrorBoundary', () => {
    // Siete pestanias, siete envoltorios. Si se anade un modulo sin aislar,
    // este test lo canta.
    const modules = [
      'DashboardHome',
      'IntelChat',
      'ExamManager',
      'FlashcardDeck',
      'PhysicalTrainer',
      'StatsPanel',
      'BiodataManager',
    ];
    const boundaries = dashboard.src.match(/<ModuleErrorBoundary/g) ?? [];
    expect(boundaries.length).toBe(modules.length);

    for (const mod of modules) {
      const idx = dashboard.src.indexOf(`<${mod}`);
      expect(idx, `${mod} no aparece en el dashboard`).toBeGreaterThan(-1);
      // El envoltorio mas cercano por delante debe ser un boundary abierto.
      const before = dashboard.src.slice(0, idx);
      const lastOpen = before.lastIndexOf('<ModuleErrorBoundary');
      const lastClose = before.lastIndexOf('</ModuleErrorBoundary>');
      expect(lastOpen, `${mod} esta fuera de un ModuleErrorBoundary`).toBeGreaterThan(lastClose);
    }
  });

  it('el panel de administracion tambien esta aislado', () => {
    expect(adminView.src).toContain('<ModuleErrorBoundary');
  });
});
