/**
 * EL TEMA — claro / oscuro / sistema.
 *
 * La clase `.dark` / `.light` del `<html>` es la ÚNICA fuente de verdad (el
 * `dark:` de Tailwind la sigue, ver `globals.css`). Un script en `<head>` la
 * pone antes de pintar; esto la mantiene sincronizada mientras la app corre.
 */

export type Tema = 'sistema' | 'claro' | 'oscuro';
export const TEMA_KEY = 'atenea-tema';

export function leeTema(): Tema {
  try {
    const t = window.localStorage.getItem(TEMA_KEY);
    if (t === 'claro' || t === 'oscuro' || t === 'sistema') return t;
  } catch { /* almacenamiento bloqueado */ }
  return 'sistema';
}

function sistemaEsOscuro(): boolean {
  return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

/** Aplica el tema al `<html>`. Con 'sistema' sigue al sistema operativo. */
export function aplicaTema(t: Tema): void {
  const oscuro = t === 'oscuro' || (t === 'sistema' && sistemaEsOscuro());
  const c = document.documentElement.classList;
  c.toggle('dark', oscuro);
  c.toggle('light', t === 'claro');
}

export function guardaTema(t: Tema): void {
  try { window.localStorage.setItem(TEMA_KEY, t); } catch { /* ídem */ }
  aplicaTema(t);
}

/**
 * Mantiene el tema al día mientras la app está abierta: si el usuario está en
 * 'sistema' y cambia el modo del SO, la app cambia con él. Devuelve la función
 * para dejar de escuchar.
 */
export function observaTema(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (leeTema() === 'sistema') aplicaTema('sistema'); };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
