'use client';

import { useEffect, useRef, useState } from 'react';
import { registraAnfitrion, esPeligrosa, type Pedido } from '@/app/lib/dialogos';
import Button from './Button';
import { RADIUS, ELEVATION, TEXT, cx } from './tokens';

/**
 * LA VENTANA DE LA APP (regla 128): se monta UNA vez en la raíz y atiende a
 * `confirmar`, `avisar` y `pedirTexto` de `app/lib/dialogos.ts`. Una pregunta
 * detrás de otra se pone en cola; Escape cancela; el botón de aceptar es
 * rojo si la pregunta va de borrar; y en el móvil se apoya abajo, donde llega
 * el pulgar, como el resto de ventanas (`Modal`).
 */
export default function DialogosHost() {
  const [cola, setCola] = useState<Pedido[]>([]);
  const [escrito, setEscrito] = useState('');
  const actual = cola[0] ?? null;

  useEffect(() => registraAnfitrion((p) => setCola((c) => [...c, p])), []);
  useEffect(() => { setEscrito(''); }, [actual]);

  const cierra = (valor: boolean | string | null) => {
    if (!actual) return;
    if (actual.tipo === 'confirmar') actual.resolve(valor === true);
    else if (actual.tipo === 'avisar') actual.resolve();
    else actual.resolve(typeof valor === 'string' ? valor : null);
    setCola((c) => c.slice(1));
  };
  const cancelaRef = useRef(cierra);
  cancelaRef.current = cierra;

  useEffect(() => {
    if (!actual) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelaRef.current(actual.tipo === 'avisar' ? true : actual.tipo === 'texto' ? null : false); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [actual]);

  if (!actual) return null;
  const { opciones } = actual;
  const titulo = opciones.titulo ?? (actual.tipo === 'avisar' ? 'Aviso' : actual.tipo === 'texto' ? 'Escribe aquí' : 'Confirma');
  const peligro = actual.tipo === 'confirmar' && (actual.opciones.peligro ?? esPeligrosa(actual.opciones.texto));

  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget && actual.tipo !== 'avisar') cierra(actual.tipo === 'texto' ? null : false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo" aria-describedby="dialogo-texto"
        className={cx('w-full max-w-md border border-slate-200 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-900', 'rounded-t-3xl sm:rounded-3xl', ELEVATION.floating, 'animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200')}>
        <div className="space-y-3 p-5 sm:p-6">
          <h3 id="dialogo-titulo" className={cx(TEXT.heading, 'text-slate-900 dark:text-white')}>{titulo}</h3>
          <p id="dialogo-texto" className="whitespace-pre-line break-words text-base leading-relaxed text-slate-700 dark:text-slate-300">{opciones.texto}</p>
          {actual.tipo === 'texto' && (
            <label className="block">
              {actual.opciones.etiqueta && <span className={cx(TEXT.label, 'mb-1 block text-slate-600 dark:text-slate-400')}>{actual.opciones.etiqueta}</span>}
              <input autoFocus value={escrito} onChange={(e) => setEscrito(e.target.value)} autoCapitalize="off" autoComplete="off" spellCheck={false}
                onKeyDown={(e) => { if (e.key === 'Enter') cierra(escrito); }}
                className={cx('min-h-[44px] w-full border-2 border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white', RADIUS.md)} />
            </label>
          )}
        </div>
        <div className={cx('flex gap-2 px-5 pb-1 sm:px-6 sm:pb-6', actual.tipo === 'avisar' ? 'justify-end' : 'flex-col-reverse sm:flex-row sm:justify-end')}>
          {actual.tipo !== 'avisar' && (
            <Button variant="secondary" onClick={() => cierra(actual.tipo === 'texto' ? null : false)}>{actual.opciones.cancelar ?? 'Cancelar'}</Button>
          )}
          <Button autoFocus={actual.tipo !== 'texto'} variant={peligro ? 'danger' : 'primary'} onClick={() => cierra(actual.tipo === 'avisar' ? true : actual.tipo === 'texto' ? escrito : true)}>
            {actual.tipo === 'avisar' ? (actual.opciones.boton ?? 'Entendido') : (actual.opciones.confirmar ?? (peligro ? 'Sí, hacerlo' : 'Aceptar'))}
          </Button>
        </div>
      </div>
    </div>
  );
}
