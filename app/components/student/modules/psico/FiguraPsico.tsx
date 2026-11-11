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
