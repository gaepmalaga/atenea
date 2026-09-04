import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * LA GUARDIA DEL SISTEMA DE DISEÑO.
 *
 * POR QUÉ EXISTE
 * Antes de `app/components/ui/`, contando las clases de los 34 componentes
 * salían NUEVE radios distintos y TRECE rellenos, de `p-1` a `p-32`. Nadie lo
 * decidió: cada pantalla se inventó su versión de una tarjeta, y por eso cada
 * una fallaba a su manera y arreglarlas de una en una no terminaba nunca.
 *
 * `globals.css` llegó a tener un sistema escrito —`.vip-card`, `.vip-button`,
 * `.vip-input`— que no usaba NI UN componente. Un sistema de diseño que no
 * muerde se ignora. Este muerde.
 *
 * Es un test ESTÁTICO: lee el código fuente, no necesita Supabase ni navegador.
 * Los comentarios se quitan antes de analizar, porque varios CITAN el patrón
 * prohibido para explicar por qué se prohíbe (la convención del repo).
 */

const COMPONENTES = join(__dirname, '..', 'app', 'components');
const UI = join(COMPONENTES, 'ui');

function recorre(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) return recorre(completo);
    return completo.endsWith('.tsx') ? [completo] : [];
  });
}

/**
 * Quita comentarios ANTES de analizar.
 *
 * Sin esto, el comentario que explica «antes esto era `rounded-[2.5rem]`»
 * cuenta como código y el test falla por documentarse a sí mismo. Ya pasó en
 * este repo y costó un rato entenderlo.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const ficheros = recorre(COMPONENTES).map((ruta) => {
  const norm = ruta.split(sep).join('/');
  const src = readFileSync(ruta, 'utf-8').replace(/\r\n/g, '\n');
  return {
    nombre: norm.slice(norm.indexOf('app/components')),
    src,
    codigo: sinComentarios(src),
    esUI: norm.includes('app/components/ui/'),
  };
});

/** Las pantallas: todo menos los propios primitivos. */
const pantallas = ficheros.filter((f) => !f.esUI);

describe('el sistema de diseño existe y se usa', () => {
  it('están los primitivos', () => {
    expect(existsSync(join(UI, 'index.ts'))).toBe(true);
    for (const pieza of ['Card', 'Button', 'Modal', 'StatTile', 'OptionCard', 'EmptyState']) {
      expect(existsSync(join(UI, `${pieza}.tsx`))).toBe(true);
    }
  });

  it('lo usan las dos mitades de la aplicación, alumno Y administración', () => {
    // Un sistema que solo usa una parte se convierte en dos sistemas.
    const usan = pantallas.filter((f) => /from '.*\/ui'/.test(f.codigo));
    expect(usan.some((f) => f.nombre.includes('/student/'))).toBe(true);
    expect(usan.some((f) => f.nombre.includes('/Admin/'))).toBe(true);
  });
});

describe('la escala no se salta', () => {
  it('ninguna pantalla inventa un radio a mano', () => {
    // `rounded-[2rem]`, `rounded-[30px]`… Había SEIS valores distintos así.
    // El radio sale de RADIUS (tokens.ts) o de las clases de Tailwind.
    const culpables: string[] = [];
    for (const f of pantallas) {
      const re = /rounded-\[[^\]]+\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.codigo))) {
        const linea = f.codigo.slice(0, m.index).split('\n').length;
        culpables.push(`${f.nombre}:${linea} ${m[0]}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it('ninguna altura de pantalla usa `vh`, que en un móvil miente', () => {
    // `100vh` es la altura CON la barra de direcciones plegada. Con la barra
    // visible —que es como se abre todo— el contenido se pasa de largo: así se
    // salía de la pantalla el pie de los cuatro modales, y el input del chat.
    // `dvh` sigue a la barra.
    const culpables: string[] = [];
    for (const f of ficheros) {
      const re = /(?:min-h|max-h|\bh)-\[[^\]]*?(?<!d)vh[^\]]*\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.codigo))) {
        const linea = f.codigo.slice(0, m.index).split('\n').length;
        culpables.push(`${f.nombre}:${linea} ${m[0]}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});

describe('lo que se toca se puede tocar', () => {
  it('ninguna pantalla escribe su propio diálogo', () => {
    // Había CINCO escritos a mano —editor del banco, editor de moderación,
    // visor de fragmentos, compositor de preguntas y reportar una pregunta— y
    // todos con el mismo fallo del `vh`. El sexto lo repetiría.
    //
    // La firma de un diálogo son DOS cosas juntas, y hacen falta las dos:
    //   · una capa a pantalla completa con un velo TRANSLÚCIDO (opacidad con
    //     barra, o desenfoque) — lo que deja ver que hay algo debajo;
    //   · dentro, una caja de ancho limitado (`max-w-…`).
    //
    // Así no se confunde con las pantallas completas de verdad, que son
    // OPACAS y no tienen nada debajo que enseñar: la sala de voz (`bg-black`)
    // y la hoja "Más" de la navegación, que ocupa todo el ancho.
    const culpables: string[] = [];
    for (const f of pantallas) {
      const velo = f.codigo
        .split('\n')
        .some((l) => /fixed inset-0/.test(l) && /(bg-\S+\/\d+|backdrop-blur)/.test(l));
      if (!velo) continue;
      if (!/max-w-(sm|md|lg|xl|\dxl)\b/.test(f.codigo)) continue;
      culpables.push(f.nombre);
    }
    expect(culpables).toEqual([]);
  });

  it('el área táctil mínima está en el botón, no en cada pantalla', () => {
    // 44px es el mínimo que recomiendan Apple y Google. Iba suelto por ahí, y
    // varios botones del panel de administración se quedaban en 32.
    const boton = readFileSync(join(UI, 'Button.tsx'), 'utf-8');
    expect(boton).toMatch(/TAP/);
    const tokens = readFileSync(join(UI, 'tokens.ts'), 'utf-8');
    expect(tokens).toMatch(/min-h-\[44px\]/);
  });

  it('los campos no provocan el zoom de Safari en iPhone', () => {
    // Safari hace zoom sobre cualquier campo con letra menor de 16px al
    // tocarlo, y deja la página descuadrada. Toda la aplicación usaba `text-sm`
    // (14px): escribir en el chat daba un salto de pantalla.
    const campos = readFileSync(join(UI, 'Field.tsx'), 'utf-8');
    expect(campos).toMatch(/text-base sm:text-sm/);
  });
});

describe('no se le enseñan al alumno números que no existen', () => {
  it('`StatTile` distingue "sin datos" de "cero"', () => {
    // Regla 8. 0 % de acierto es un alumno que va mal; `null` es uno que no ha
    // empezado. El componente obliga a decidir cuál es.
    const tile = readFileSync(join(UI, 'StatTile.tsx'), 'utf-8');
    expect(tile).toMatch(/value: number \| string \| null/);
    expect(tile).toMatch(/'—'/);
  });

  it('ningún título grande se queda sin escalón de móvil', () => {
    // `tokens.ts` lo dice desde que existe: los tamaños grandes SIEMPRE
    // escalan. Un tamaño SIN prefijo es el de MÓVIL, y de `text-6xl` (60px)
    // hacia arriba no hay pantalla de 360px que lo aguante: el cronometro de
    // las pruebas fisicas estaba a `text-7xl` (72px) y el contador de series a
    // `text-9xl` (128px), fijos. Lo grande vive detras de un `sm:`.
    //
    // El limite esta en 6xl y no en 4xl a proposito: 36-48px en un movil es un
    // numero protagonista legitimo —`TEXT.display` es `text-4xl sm:text-6xl`—
    // y una guardia que se queja de lo razonable acaba desactivada.
    const culpables: string[] = [];
    for (const f of pantallas) {
      // Se analiza el codigo SIN comentarios pero conservando los saltos de
      // linea, para poder decir donde está sin que un comentario que cita el
      // patron cuente como codigo (la convencion del repo).
      const limpio = f.src
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      limpio.split('\n').forEach((linea, i) => {
        const m = /(?<![:\w-])text-([6-9]xl)\b/.exec(linea);
        if (m) culpables.push(`${f.nombre}:${i + 1} text-${m[1]} sin escalón de móvil`);
      });
    }
    expect(culpables, 'títulos que no escalan').toEqual([]);
  });

  it('no vuelve el marcador de puntos inventado', () => {
    // El historial pintaba "+10 XP" en cada acierto y el centro de mando una
    // racha de "1 Día" y "5 Flashcards pendientes": ni columna, ni tabla, ni
    // cálculo. Números escritos a mano que el alumno leía como su progreso.
    const culpables: string[] = [];
    for (const f of pantallas) {
      if (/\+\d+\s*XP/.test(f.codigo)) culpables.push(`${f.nombre} (XP inventado)`);
    }
    expect(culpables).toEqual([]);
  });
});
