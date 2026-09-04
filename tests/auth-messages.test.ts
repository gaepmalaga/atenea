import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mensajeDeAuth, MENSAJE_GENERICO } from '../app/lib/auth-messages';

/**
 * La pantalla de entrada es el primer texto que ve alguien que llega a la
 * plataforma, y estaba SIN TRADUCIR: `err.message` de Supabase, pintado tal
 * cual, en ingles.
 */
describe('lo que dice Supabase, dicho en cristiano', () => {
  it('traduce la contrasena equivocada, que es el error mas comun', () => {
    const m = mensajeDeAuth(new Error('Invalid login credentials'));
    expect(m).toContain('incorrectos');
    expect(m).not.toMatch(/invalid|credentials/i);
  });

  it('explica el correo sin confirmar, que aqui no es un error del usuario', () => {
    // `Confirm email` esta ACTIVADO en el proyecto: quien se registra no puede
    // entrar hasta pulsar el enlace. Con el mensaje en ingles y sin
    // explicacion, eso se lee como "la plataforma no funciona".
    const m = mensajeDeAuth(new Error('Email not confirmed'));
    expect(m).toMatch(/enlace/i);
    expect(m).toMatch(/spam/i);
  });

  it('reconoce el mensaje aunque traiga un numero pegado', () => {
    // Supabase manda "For security purposes, you can only request this after
    // 47 seconds". Comparar por igualdad no lo pillaria nunca.
    const m = mensajeDeAuth(
      new Error('For security purposes, you can only request this after 47 seconds'),
    );
    expect(m).toMatch(/demasiadas veces/i);
  });

  it('no se traga un error que no conoce', () => {
    // Un mensaje en ingles sin traducir sigue siendo mas util que "error", y
    // asi se ve en cuanto aparece y se puede anadir a la tabla.
    expect(mensajeDeAuth(new Error('Something entirely new'))).toBe('Something entirely new');
  });

  it('nunca devuelve "undefined" con algo que no es un Error', () => {
    // `err.message` sobre un `any` compilaba aunque lo lanzado no fuera un
    // Error: entonces el usuario leia literalmente "undefined".
    for (const basura of [undefined, null, 42, {}, [], new Error('')]) {
      const m = mensajeDeAuth(basura);
      expect(m).toBe(MENSAJE_GENERICO);
      expect(m).not.toMatch(/undefined/);
    }
  });
});

/**
 * Quita los comentarios ANTES de analizar.
 *
 * Es la convencion del repo y no es opcional: los comentarios de `LoginScreen`
 * CITAN `glass-panel`, `animate-float`, `h-screen` y `alert()` para explicar
 * por que se quitaron. Sin esto, el fichero falla por documentarse a si mismo
 * — paso al escribir este mismo test.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('la puerta de entrada no se queda fuera del sistema de diseno', () => {
  const login = sinComentarios(readFileSync(
    join(__dirname, '..', 'app', 'components', 'auth', 'LoginScreen.tsx'),
    'utf-8',
  ));
  const page = sinComentarios(readFileSync(join(__dirname, '..', 'app', 'page.tsx'), 'utf-8'));

  it('vive en app/components/, que es lo unico que recorre la guarda del diseno', () => {
    // ESTA es la razon de que fuera la unica pantalla sin migrar:
    // `design-system.test.ts` recorre `app/components/` y nada mas, asi que
    // en `app/page.tsx` no la alcanzaba ninguna regla.
    expect(login).toMatch(/from '\.\.\/ui'/);
    expect(page).toMatch(/components\/auth\/LoginScreen/);
  });

  it('los campos permiten al gestor de contrasenas rellenarlos', () => {
    // Sin `autoComplete` ningun gestor ofrece el relleno, y en un movil eso es
    // teclear una contrasena larga con el pulgar cada vez.
    expect(login).toMatch(/autoComplete="email"/);
    expect(login).toMatch(/current-password/);
    expect(login).toMatch(/new-password/);
  });

  it('el correo no entra con mayuscula inicial desde el movil', () => {
    // Android e iOS capitalizan la primera letra por defecto: el correo salia
    // como "Gaepmalaga@..." y el login fallaba sin que se viera por que.
    expect(login).toMatch(/autoCapitalize="none"/);
  });

  it('ninguna pantalla de entrada mide la altura en `vh`', () => {
    // `100vh` es la altura CON la barra de direcciones plegada (regla 36).
    for (const src of [login, page]) {
      expect(src).not.toMatch(/(?:^|[^d])(?:h|min-h|max-h)-screen\b/);
      expect(src).toMatch(/min-h-dvh/);
    }
  });

  it('no queda ningun `alert()` del navegador', () => {
    // El registro terminaba en un `alert()` que ademas mentia: decia "revisa
    // tu email O inicia sesion", y con `Confirm email` activado la segunda
    // mitad manda a chocarse contra "Email not confirmed".
    for (const src of [login, page]) {
      expect(src).not.toMatch(/(?<![\w.])alert\s*\(/);
    }
  });

  it('no usa clases decorativas que no existen', () => {
    // `glass-panel` y `animate-float` no estan en `globals.css` ni vienen de
    // ningun plugin instalado: no hacian nada desde el primer dia.
    for (const src of [login, page]) {
      expect(src).not.toMatch(/glass-panel|animate-float/);
    }
  });
});
