import { ImageResponse } from 'next/og';

/**
 * El icono para «Añadir a pantalla de inicio» en iOS. iOS ya redondea las
 * esquinas y no aplica recorte circular, así que aquí la «A» va más grande y
 * sin tanto margen que en `icon.tsx`.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const s = 180;
  const stripe = Math.round(s * 0.16);

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
            fontSize: s * 0.68,
            fontWeight: 900,
            color: '#f8fafc',
            letterSpacing: -3,
            marginTop: -stripe / 2,
            fontFamily: 'sans-serif',
          }}
        >
          A
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', height: stripe }}>
          <div style={{ width: '22%', background: '#c60b1e' }} />
          <div style={{ width: '56%', background: '#ffc400' }} />
          <div style={{ width: '22%', background: '#c60b1e' }} />
        </div>
      </div>
    ),
    size,
  );
}
