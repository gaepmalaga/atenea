import { ImageResponse } from 'next/og';

/**
 * El icono de la aplicación (favicon y PWA). Antes solo estaba el `favicon.ico`
 * por defecto de Next —un triángulo de Vercel— y en el móvil salía borroso y
 * ajeno. Esto lo genera Next en el build como PNG de 512, y el navegador lo
 * baja de tamaño donde haga falta. Zona segura del 12 % para el recorte
 * circular «maskable» de Android.
 *
 * La identidad es la del login (regla 43): plano, tinta oscura, y el filete de
 * la bandera en 1:2:1.
 */

const S = 512;

export const size = { width: S, height: S };
export const contentType = 'image/png';

export default function Icon() {
  const pad = Math.round(S * 0.12);
  const stripe = Math.round(S * 0.14);
  const borde = Math.round(S * 0.02);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          position: 'relative',
        }}
      >
        <div
          style={{
            fontSize: S * 0.6,
            fontWeight: 900,
            color: '#f8fafc',
            letterSpacing: -8,
            marginTop: -stripe / 2,
            fontFamily: 'sans-serif',
          }}
        >
          A
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', height: stripe }}>
          <div style={{ width: '22%', height: '100%', background: '#c60b1e' }} />
          <div style={{ width: '56%', height: '100%', background: '#ffc400' }} />
          <div style={{ width: '22%', height: '100%', background: '#c60b1e' }} />
        </div>
        <div
          style={{
            position: 'absolute',
            top: pad,
            left: pad,
            right: pad,
            bottom: pad,
            border: `${borde}px solid #6366f1`,
            borderRadius: S * 0.08,
          }}
        />
      </div>
    ),
    size,
  );
}
