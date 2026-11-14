import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Regla 129 · el enlace de «¿Olvidaste tu contraseña?» pide una contraseña nueva, y el admin puede cambiar la suya. */

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (rel: string) => quita(readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n'));

describe('recuperar la contraseña (PKCE)', () => {
  const s = lee('app/components/AppShell.tsx');

  it('al volver de una recuperación se enseña «Elige tu contraseña», no se deja entrar sin más', () => {
    expect(s).toMatch(/onAuthStateChange\(\(evento\) => \{\s*if \(evento === 'PASSWORD_RECOVERY'\) setNeedsPassword\(true\);/);
  });

  it('el aviso se escucha ANTES de canjear el código, y se deja de escuchar al salir', () => {
    expect(s.indexOf("evento === 'PASSWORD_RECOVERY'")).toBeGreaterThan(-1);
    expect(s.indexOf("evento === 'PASSWORD_RECOVERY'")).toBeLessThan(s.indexOf('exchangeCodeForSession(code)'));
    expect(s).toContain('data.subscription.unsubscribe()');
  });

  it('con la contraseña por poner, la pantalla de «Elige tu contraseña» manda sobre el panel', () => {
    expect(s).toMatch(/if \(needsPassword \|\| user\?\.debeCambiarClave\) \{\s*return \(\s*<SetPasswordScreen/);
  });

  it('el cliente del navegador es PKCE (por eso el enlace vuelve con ?code=)', () => {
    const ssr = readFileSync(join(__dirname, '..', 'node_modules/@supabase/ssr/dist/main/createBrowserClient.js'), 'utf-8');
    expect(ssr).toContain('flowType: "pkce"');
  });
});

describe('el administrador puede cambiar su contraseña', () => {
  it('el panel tiene el botón (escritorio y menú del móvil) y solo si se le da el manejador', () => {
    const p = lee('app/components/ui/panel/PanelShell.tsx');
    expect(p.match(/aria-label="Cambiar mi contraseña"/g)).toHaveLength(2);
    expect(p).toContain('{onClave && (');
    expect(p).toContain('{onClave && <button');
  });
  it('AdminView lo conecta con la misma pieza que usa el alumno, abierta', () => {
    const a = lee('app/components/Admin/AdminView.tsx');
    expect(a).toContain('onClave={() => setCambiandoClave(true)}');
    expect(a).toContain('<CambiarClave inicialAbierta />');
  });
  it('la pieza cambia la contraseña con la sesión propia y quita la marca de provisional', () => {
    const c = lee('app/components/student/CambiarClave.tsx');
    expect(c).toContain('supabase.auth.updateUser({ password: clave, data: { [META_CLAVE_PROVISIONAL]: false } })');
    expect(c).toContain('MIN_CLAVE');
  });
});
