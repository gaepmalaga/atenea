import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

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

const files = walk(COMPONENTS).map((path) => {
  // En Windows `join` separa con la barra invertida, asi que buscar la ruta
  // en forma POSIX daba -1. Normalizamos para no depender del sistema.
  const norm = path.split(sep).join('/');
  return {
    name: norm.slice(norm.indexOf('app/components')),
    src: readFileSync(path, 'utf-8').replace(/\r\n/g, '\n'),
  };
});

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

/**
 * No vuelven los `any`.
 *
 * El CLAUDE.md los tenia listados como trampa conocida: "son la razon por la
 * que los desajustes de nombres de campo llegaron a produccion sin que nadie se
 * enterara". No era teoria. Con el estado tipado como `any` se pintaron durante
 * meses tres campos que no existen:
 *
 *   · `u.total_tests` y `u.win_rate`  -> siempre "0" y "0%" en el panel de usuarios
 *   · `q.difficulty`                  -> la columna es `difficulty_level`
 *   · `q.topic` en question_bank      -> la tabla guarda `subject_id`
 *
 * Los tres salieron solos en cuanto se les puso un tipo de verdad.
 */
describe('nada de `any` en el codigo de la aplicacion', () => {
  const APP = join(__dirname, '..', 'app');

  function todos(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return todos(full);
      return /\.tsx?$/.test(full) ? [full] : [];
    });
  }

  it('ni un `: any` ni un `as any` en app/', () => {
    const culpables: string[] = [];

    for (const ruta of todos(APP)) {
      const norm = ruta.split(sep).join('/');
      const nombre = norm.slice(norm.indexOf('app/'));
      const src = readFileSync(ruta, 'utf-8').replace(/\r\n/g, '\n');

      // Los comentarios hablan de `any` para explicar por que se quitaron.
      const sinComentarios = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

      // `: any`, `<any>`, `as any` y `any[]`.
      const re = /(:\s*any\b|<any[,>]|\bas any\b|\bany\[\])/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sinComentarios))) {
        const linea = sinComentarios.slice(0, m.index).split('\n').length;
        culpables.push(`${nombre}:${linea} -> ${m[1].trim()}`);
      }
    }

    expect(culpables).toEqual([]);
  });
});
