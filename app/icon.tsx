import { ImageResponse } from 'next/og';
import { EscudoAtenea } from './lib/logo';

/**
 * El icono de la aplicación (favicon y PWA). Lo genera Next en el build como
 * PNG de 512; el navegador lo baja de tamaño donde haga falta.
 *
 * La marca es la égida (`app/lib/logo.tsx`), compartida con `apple-icon.tsx`.
 */

const S = 512;

export const size = { width: S, height: S };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        <EscudoAtenea size={S} />
      </div>
    ),
    size,
  );
}
