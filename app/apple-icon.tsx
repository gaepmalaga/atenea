import { ImageResponse } from 'next/og';
import { EscudoAtenea } from './lib/logo';

/**
 * El icono para «Añadir a pantalla de inicio» en iOS. iOS redondea las esquinas
 * y no aplica recorte circular, así que sirve el mismo escudo que el favicon.
 */

const S = 180;

export const size = { width: S, height: S };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        <EscudoAtenea size={S} />
      </div>
    ),
    size,
  );
}
