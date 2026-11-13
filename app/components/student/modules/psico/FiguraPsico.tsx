import type { Celda } from '@/app/lib/psico';

/**
 * UNA CASILLA DE LAS FIGURAS (regla 117): `n` formas iguales en fila, con su
 * relleno. Es un SVG dibujado por código: no hay imágenes que cargar, se ve
 * igual en claro y en oscuro (`currentColor`) y pesa lo que pesan diez líneas.
 */
const RELLENO = { vacio: 'none', gris: 'currentColor', negro: 'currentColor' } as const;
const OPACIDAD = { vacio: 1, gris: 0.35, negro: 1 } as const;

function forma(c: Celda, cx: number, cy: number, r: number, clave: number) {
  const comun = {
    fill: RELLENO[c.relleno], fillOpacity: OPACIDAD[c.relleno],
    stroke: 'currentColor', strokeWidth: 2.4, strokeLinejoin: 'round' as const,
  };
  if (c.forma === 'circulo') return <circle key={clave} cx={cx} cy={cy} r={r} {...comun} />;
  if (c.forma === 'cuadrado') return <rect key={clave} x={cx - r} y={cy - r} width={2 * r} height={2 * r} {...comun} />;
  if (c.forma === 'triangulo') return <polygon key={clave} points={`${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`} {...comun} />;
  if (c.forma === 'rombo') return <polygon key={clave} points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} {...comun} />;
  const g = r * 0.38;
  return (
    <polygon
      key={clave}
      points={`${cx - g},${cy - r} ${cx + g},${cy - r} ${cx + g},${cy - g} ${cx + r},${cy - g} ${cx + r},${cy + g} ${cx + g},${cy + g} ${cx + g},${cy + r} ${cx - g},${cy + r} ${cx - g},${cy + g} ${cx - r},${cy + g} ${cx - r},${cy - g} ${cx - g},${cy - g}`}
      {...comun}
    />
  );
}

const NOMBRE = { circulo: 'círculo', cuadrado: 'cuadrado', triangulo: 'triángulo', rombo: 'rombo', cruz: 'cruz' } as const;
const NOMBRE_RELLENO = { vacio: 'vacío', gris: 'gris', negro: 'negro' } as const;

/** Cómo se lee una casilla en voz alta: «2 triángulos en gris». */
export function describeCelda(c: Celda): string {
  const plural = c.n > 1 ? (c.forma === 'cruz' ? 'cruces' : `${NOMBRE[c.forma]}s`) : NOMBRE[c.forma];
  return `${c.n} ${plural} en ${NOMBRE_RELLENO[c.relleno]}`;
}

export default function FiguraPsico({ celda, className }: { celda: Celda | null; className?: string }) {
  if (!celda) {
    return (
      <svg viewBox="0 0 96 64" className={className} role="img" aria-label="La casilla que falta">
        <text x="48" y="44" textAnchor="middle" fontSize="36" fontWeight="800" fill="currentColor">?</text>
      </svg>
    );
  }
  const r = 11;
  const paso = 30;
  const x0 = 48 - ((celda.n - 1) * paso) / 2;
  return (
    <svg viewBox="0 0 96 64" className={className} role="img" aria-label={describeCelda(celda)}>
      {Array.from({ length: celda.n }, (_, i) => forma(celda, x0 + i * paso, 32, r, i))}
    </svg>
  );
}

// ── Dominós ──

/** Dónde van los puntos de una mitad, en una cuadrícula de 3×3 (0,0 = arriba a la izquierda). */
const PUNTOS_DE: Record<number, [number, number][]> = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/**
 * Una ficha de dominó, en vertical: la mitad de arriba y la de abajo con sus
 * puntos. Con `null` es el hueco de la que falta. SVG con `currentColor`, como
 * las figuras.
 */
export function FichaDomino({ ficha, className }: { ficha: [number, number] | null; className?: string }) {
  if (!ficha) {
    return (
      <svg viewBox="0 0 48 88" className={className} role="img" aria-label="La ficha que falta">
        <rect x="2" y="2" width="44" height="84" rx="6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="5 4" />
        <text x="24" y="56" textAnchor="middle" fontSize="34" fontWeight="800" fill="currentColor">?</text>
      </svg>
    );
  }
  const mitad = (n: number, y0: number) => PUNTOS_DE[n].map(([c, f], i) => (
    <circle key={`${y0}-${i}`} cx={10 + c * 14} cy={y0 + 10 + f * 11} r={3.6} fill="currentColor" />
  ));
  return (
    <svg viewBox="0 0 48 88" className={className} role="img" aria-label={`Ficha de dominó: ${ficha[0]} arriba y ${ficha[1]} abajo`}>
      <rect x="2" y="2" width="44" height="84" rx="6" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <line x1="6" y1="44" x2="42" y2="44" stroke="currentColor" strokeWidth="2.4" />
      {mitad(ficha[0], 2)}
      {mitad(ficha[1], 44)}
    </svg>
  );
}

// ── Rotaciones ──

/** Una figura de cuadraditos sobre una rejilla 3×3. */
export function RejillaPsico({ rejilla, className }: { rejilla: boolean[][]; className?: string }) {
  return (
    <svg viewBox="0 0 66 66" className={className} role="img"
      aria-label={`Figura de ${rejilla.flat().filter(Boolean).length} cuadrados: ${rejilla.map((f, i) => `fila ${i + 1}: ${f.map((x) => (x ? 'lleno' : 'vacío')).join(', ')}`).join('; ')}`}>
      {rejilla.map((fila, i) => fila.map((lleno, j) => (
        <rect key={`${i}-${j}`} x={3 + j * 20} y={3 + i * 20} width={18} height={18} rx={2}
          fill={lleno ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={lleno ? 0 : 1} strokeOpacity={0.3} />
      )))}
    </svg>
  );
}

// ── Ejercicio 2: símbolos y nombres ──

/**
 * Los cinco dibujos base del ejercicio 2, en una caja de 24×24; cada uno se
 * gira 0, 90, 180 y 270 grados y da 5 × 4 = 20 símbolos distintos (ninguno
 * tiene simetría, así que no hay dos iguales). `id = dibujo * 4 + giro`.
 */
const DIBUJOS = [
  ['M6 18 V6 H18'],
  ['M5 19 V5 H19', 'M9 19 V9 H19'],
  ['M5 7 H19', 'M12 7 V19'],
  ['M5 6 H19', 'M5 10 H19', 'M12 10 V19'],
  ['M6 18 V6 H18', 'M6 12 H11'],
] as const;

export function SimboloPsico({ id, className }: { id: number; className?: string }) {
  const dibujo = DIBUJOS[Math.floor(id / 4) % DIBUJOS.length];
  const giro = (id % 4) * 90;
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={`Símbolo ${id + 1}`}>
      <g transform={`rotate(${giro} 12 12)`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="square">
        {dibujo.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}

/** Una fila de símbolos (una opción del ejercicio 2). */
export function FilaSimbolos({ fila }: { fila: number[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-slate-900 dark:text-white">
      {fila.map((id, i) => <SimboloPsico key={i} id={id} className="h-7 w-7" />)}
    </span>
  );
}

/** La tabla de los 20 símbolos con sus nombres, como en la hoja del examen. */
export function TablaSimbolos({ leyenda }: { leyenda: { nombre: string; simbolo: number }[] }) {
  return (
    <div className="mt-3 grid grid-cols-5 gap-px overflow-hidden rounded-lg border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700" role="group" aria-label="La tabla de símbolos y nombres">
      {leyenda.map((x) => (
        <div key={x.nombre} className="grid justify-items-center gap-0.5 bg-white px-0.5 py-1.5 dark:bg-slate-900">
          <SimboloPsico id={x.simbolo} className="h-6 w-6 text-slate-900 dark:text-white" />
          <span className="max-w-full truncate text-[10px] font-semibold text-slate-800 dark:text-slate-200">{x.nombre}</span>
        </div>
      ))}
    </div>
  );
}

// ── Cubos, desarrollos, plegados y giros (13 nov) ──

/** Una figura de cubos en perspectiva isométrica: `alturas[fila][columna]` cubos apilados en cada columna. */
export function CubosPsico({ alturas, className }: { alturas: number[][]; className?: string }) {
  const lado = 14, dx = lado * 0.866, dy = lado * 0.5;
  type Cara = { puntos: [number, number][]; opacidad: number };
  const caras: Cara[] = [];
  const celdas: { x: number; y: number; z: number }[] = [];
  alturas.forEach((fila, y) => fila.forEach((h, x) => { for (let z = 0; z < h; z++) celdas.push({ x, y, z }); }));
  // De atrás hacia delante (más cerca = más abajo en pantalla = mayor x + y) y de abajo arriba.
  celdas.sort((a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z);
  for (const { x, y, z } of celdas) {
    const ax = (x - y) * dx, ay = (x + y) * dy - (z + 1) * lado;
    caras.push({ opacidad: 0.2, puntos: [[ax, ay], [ax + dx, ay + dy], [ax, ay + 2 * dy], [ax - dx, ay + dy]] });                                   // arriba
    caras.push({ opacidad: 0.5, puntos: [[ax - dx, ay + dy], [ax, ay + 2 * dy], [ax, ay + 2 * dy + lado], [ax - dx, ay + dy + lado]] });           // izquierda
    caras.push({ opacidad: 0.8, puntos: [[ax, ay + 2 * dy], [ax + dx, ay + dy], [ax + dx, ay + dy + lado], [ax, ay + 2 * dy + lado]] });           // derecha
  }
  const xs = caras.flatMap((c) => c.puntos.map((p) => p[0])), ys = caras.flatMap((c) => c.puntos.map((p) => p[1]));
  const minX = Math.min(...xs) - 3, minY = Math.min(...ys) - 3;
  const ancho = Math.max(...xs) - minX + 3, alto = Math.max(...ys) - minY + 3;
  const total = alturas.flat().reduce((a, b) => a + b, 0);
  return (
    <svg viewBox={`${minX} ${minY} ${ancho} ${alto}`} className={className} role="img" aria-label={`Figura de cubos apilados (columnas de ${alturas.map((f) => f.join(', ')).join(' / ')}); en total ${total}`}>
      {caras.map((c, i) => {
        const puntos = c.puntos.map((p) => p.join(',')).join(' ');
        // Primero un fondo opaco: las caras de atrás no se ven a través de las de delante.
        return (
          <g key={i}>
            <polygon points={puntos} fill="#fff" className="fill-white dark:fill-slate-900" />
            <polygon points={puntos} fill="currentColor" fillOpacity={c.opacidad} stroke="currentColor" strokeWidth={0.9} strokeLinejoin="round" />
          </g>
        );
      })}
    </svg>
  );
}

/** El desarrollo de un cubo: seis casillas con su símbolo. */
export function DesarrolloPsico({ desarrollo, className }: { desarrollo: { x: number; y: number; s: string }[]; className?: string }) {
  const L = 26;
  const ancho = (Math.max(...desarrollo.map((c) => c.x)) + 1) * L + 4, alto = (Math.max(...desarrollo.map((c) => c.y)) + 1) * L + 4;
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className={className} role="img" aria-label={`Desarrollo de un cubo con las figuras ${desarrollo.map((c) => c.s).join(' ')}`}>
      {desarrollo.map((c) => (
        <g key={`${c.x}-${c.y}`}>
          <rect x={2 + c.x * L} y={2 + c.y * L} width={L} height={L} fill="none" stroke="currentColor" strokeWidth={1.6} />
          <text x={2 + c.x * L + L / 2} y={2 + c.y * L + L / 2 + 5} textAnchor="middle" fontSize={15} fill="currentColor">{c.s}</text>
        </g>
      ))}
    </svg>
  );
}

/** Un papel abierto: casillas con un agujero (círculo) donde se ha perforado. */
export function AgujerosPsico({ agujeros, className }: { agujeros: boolean[][]; className?: string }) {
  const L = 16, n = agujeros.length;
  return (
    <svg viewBox={`0 0 ${n * L + 4} ${n * L + 4}`} className={className} role="img"
      aria-label={`Papel abierto con ${agujeros.flat().filter(Boolean).length} agujeros, en las casillas ${agujeros.flatMap((f, y) => f.map((a, x) => (a ? `fila ${y + 1} columna ${x + 1}` : ''))).filter(Boolean).join(', ')}`}>
      <rect x={2} y={2} width={n * L} height={n * L} fill="none" stroke="currentColor" strokeWidth={1.8} />
      {Array.from({ length: n - 1 }, (_, i) => (
        <g key={i} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1}>
          <line x1={2 + (i + 1) * L} y1={2} x2={2 + (i + 1) * L} y2={2 + n * L} />
          <line x1={2} y1={2 + (i + 1) * L} x2={2 + n * L} y2={2 + (i + 1) * L} />
        </g>
      ))}
      {agujeros.map((f, y) => f.map((a, x) => a && <circle key={`${x}-${y}`} cx={2 + x * L + L / 2} cy={2 + y * L + L / 2} r={4.6} fill="currentColor" />))}
    </svg>
  );
}

/** Un elemento de la figura de giros, dibujado en 0,0 apuntando hacia arriba. */
function ElementoGiro({ forma }: { forma: 'flecha' | 'triangulo' | 'cruz' | 'cuadrado' }) {
  if (forma === 'flecha') return <path d="M0 10 V-10 M-6 -4 L0 -10 L6 -4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />;
  if (forma === 'triangulo') return <polygon points="0,-10 9,8 -9,8" fill="currentColor" />;
  if (forma === 'cruz') return <path d="M-9 0 H9 M0 -9 V9" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />;
  return <rect x={-8} y={-8} width={16} height={16} fill="currentColor" />;
}

/** Una figura de giros: un aro con cuatro elementos (arriba, derecha, abajo, izquierda). */
export function FiguraGiro({ figura, className }: { figura: { forma: 'flecha' | 'triangulo' | 'cruz' | 'cuadrado'; giro: number }[]; className?: string }) {
  const centros: [number, number][] = [[50, 17], [83, 50], [50, 83], [17, 50]];
  const donde = ['arriba', 'a la derecha', 'abajo', 'a la izquierda'];
  const sentido = ['hacia arriba', 'hacia la derecha', 'hacia abajo', 'hacia la izquierda'];
  return (
    <svg viewBox="0 0 100 100" className={className} role="img"
      aria-label={`Figura con ${figura.map((e, i) => `${e.forma}${e.forma === 'flecha' || e.forma === 'triangulo' ? ` ${sentido[e.giro]}` : ''} ${donde[i]}`).join(', ')}`}>
      <circle cx={50} cy={50} r={44} fill="none" stroke="currentColor" strokeWidth={2} strokeOpacity={0.45} />
      {figura.map((e, i) => (
        <g key={i} transform={`translate(${centros[i][0]} ${centros[i][1]}) rotate(${e.giro * 90})`}><ElementoGiro forma={e.forma} /></g>
      ))}
    </svg>
  );
}
