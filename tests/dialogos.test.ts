import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { confirmar, avisar, pedirTexto, registraAnfitrion, esPeligrosa, type Pedido } from '../app/lib/dialogos';

/** Regla 128 · las ventanas de la app. */

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function ficheros(dir: string, salida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ficheros(p, salida);
    else if (/\.(tsx?|jsx?)$/.test(n)) salida.push(p);
  }
  return salida;
}

describe('las ventanas de la app', () => {
  let baja: (() => void) | null = null;
  afterEach(() => { baja?.(); baja = null; vi.unstubAllGlobals(); });

  it('confirmar espera lo que conteste la ventana', async () => {
    const vistos: Pedido[] = [];
    baja = registraAnfitrion((p) => { vistos.push(p); if (p.tipo === 'confirmar') p.resolve(p.opciones.texto.includes('sí')); });
    expect(await confirmar('¿sí?')).toBe(true);
    expect(await confirmar({ texto: '¿no?' })).toBe(false);
    expect(vistos).toHaveLength(2);
  });

  it('avisar y pedirTexto también pasan por la ventana; cancelar el texto da null', async () => {
    baja = registraAnfitrion((p) => {
      if (p.tipo === 'avisar') p.resolve();
      if (p.tipo === 'texto') p.resolve(p.opciones.texto === 'ok' ? 'BORRAR' : null);
    });
    await expect(avisar('Hecho')).resolves.toBeUndefined();
    expect(await pedirTexto('ok')).toBe('BORRAR');
    expect(await pedirTexto('cancelo')).toBeNull();
  });

  it('sin ventana montada se cae al diálogo del navegador: la pregunta nunca se pierde', async () => {
    const confirmNativo = vi.fn(() => true);
    const alertNativo = vi.fn();
    const promptNativo = vi.fn(() => 'x');
    vi.stubGlobal('window', { confirm: confirmNativo, alert: alertNativo, prompt: promptNativo });
    expect(await confirmar('¿seguro?')).toBe(true);
    await avisar('ojo');
    expect(await pedirTexto('escribe')).toBe('x');
    expect(confirmNativo).toHaveBeenCalledWith('¿seguro?');
    expect(alertNativo).toHaveBeenCalledWith('ojo');
  });

  it('dar de baja la ventana deja de atender, y una más nueva no se pisa', async () => {
    const a = registraAnfitrion((p) => { if (p.tipo === 'confirmar') p.resolve(true); });
    const b = registraAnfitrion((p) => { if (p.tipo === 'confirmar') p.resolve(false); });
    a(); // dar de baja la vieja no quita la nueva
    baja = b;
    expect(await confirmar('¿?')).toBe(false);
  });

  it('una pregunta de borrar sale en rojo y una normal no', () => {
    for (const t of ['¿Borrar esta sesión?', '¿Anular el recibo nº 4?', '¿Suspender a Ana?', '¿Apagar «Fichas»?', 'No se puede deshacer.', '¿Rechazar la solicitud?']) expect(esPeligrosa(t), t).toBe(true);
    for (const t of ['¿Entregar la sesión?', '¿Publico también la semana?', '¿Lo apunto igualmente?']) expect(esPeligrosa(t), t).toBe(false);
  });
});

describe('guarda: nada de ventanas del navegador', () => {
  const dentro = ficheros(join(__dirname, '..', 'app')).filter((f) => !/dialogos\.ts$/.test(f));
  it('ni confirm, ni alert, ni prompt en el código de la app', () => {
    const malos: string[] = [];
    for (const f of dentro) {
      const c = quita(readFileSync(f, 'utf-8'));
      if (/(^|[^\w.])(?:window\.)?(confirm|alert|prompt)\(/.test(c)) malos.push(f.replace(join(__dirname, '..') + '/', ''));
    }
    expect(malos).toEqual([]);
  });
  it('la ventana se monta una vez en la raíz y en el banco de pruebas', () => {
    expect(readFileSync(join(__dirname, '..', 'app/layout.tsx'), 'utf-8')).toContain('<DialogosHost />');
    expect(readFileSync(join(__dirname, '..', '.banco-pruebas/entrada.tsx'), 'utf-8')).toContain('<DialogosHost />');
  });
  it('la ventana respeta el pulgar y el teclado: abajo en móvil, Escape cancela, 44 px', () => {
    const h = readFileSync(join(__dirname, '..', 'app/components/ui/DialogosHost.tsx'), 'utf-8');
    expect(h).toContain("e.key === 'Escape'");
    expect(h).toContain('items-end');
    expect(h).toContain('safe-area-inset-bottom');
    expect(h).toContain('text-base');
  });
});
