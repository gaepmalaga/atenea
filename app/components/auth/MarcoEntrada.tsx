import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { MARCA } from '@/app/lib/marca';
import { FONDO_MARINO } from './fondoMarca';

/**
 * EL MARCO DE LAS PANTALLAS DE ENTRADA (regla 90): entrar, crear cuenta,
 * poner la contraseña, elegir academia y «tu acceso no está activo».
 *
 * Sigue a la pantalla de carga (regla 87) sin salto: el mismo marino, la misma
 * «A» monumental saliéndose por la derecha y el logotipo abajo a la izquierda.
 * En el MÓVIL la marca ocupa la parte de arriba y el formulario sube encima en
 * una hoja blanca; en el ORDENADOR son dos columnas, la marca con lo que
 * ofrece la academia a la izquierda y el formulario a la derecha.
 *
 * No sigue el tema claro/oscuro, como la puerta de antes (regla 43): es una
 * pantalla de marca y su papel es parte del diseño. Por eso pinta su propio
 * fondo en vez de heredar el de la aplicación.
 *
 * La altura va en `dvh` (regla 36): `vh` es la altura con la barra de
 * direcciones plegada, y en un móvil el pie se iría por debajo.
 */

const LO_QUE_HAY = [
  { titulo: 'Tests que puntúan como el examen', texto: 'Con la fórmula de la convocatoria: cada dos fallos, un acierto menos.' },
  { titulo: 'Un repaso que se adapta a ti', texto: 'Te vuelve lo que se te olvida, justo antes de que se te olvide.' },
  { titulo: 'Física y clases en la misma app', texto: 'El plan de tu preparador, tus marcas con el baremo oficial y tus avisos de falta.' },
];

export default function MarcoEntrada({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-slate-900 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* ─── La marca ─────────────────────────────────────────────────── */}
      <section
        className="relative h-[38dvh] min-h-[260px] max-h-[360px] overflow-hidden text-white lg:h-auto lg:max-h-none lg:min-h-dvh"
        style={{ background: FONDO_MARINO }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={MARCA.isotipo}
          alt=""
          aria-hidden
          width={1065}
          height={1106}
          fetchPriority="high"
          className="puerta-a pointer-events-none absolute left-[50%] top-[-12%] w-[72%] max-w-none drop-shadow-[0_24px_48px_rgba(4,10,28,0.45)] lg:left-[44%] lg:top-auto lg:bottom-[-12%] lg:w-[min(80%,66dvh)]"
        />

        <div className="relative flex h-full flex-col justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-12 sm:px-8 lg:min-h-dvh lg:px-14 lg:py-12">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: MARCA.colores.doradoClaro }}>
              Policía Nacional<span className="hidden lg:inline"> · Escala Básica</span>
            </p>
            <div className="hidden lg:block max-w-md mt-10">
              <h2 className="lg:text-5xl xl:text-6xl font-extrabold leading-[1.02] tracking-tight">
                Entra y saca <span className="underline decoration-[#c5a738] decoration-[6px] underline-offset-[10px]">tu plaza</span>.
              </h2>
              <ul className="mt-10 space-y-5">
                {LO_QUE_HAY.map((l) => (
                  <li key={l.titulo} className="flex gap-3.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#c5a738]/20 text-[#e2c977]">
                      <Check size={14} strokeWidth={3} aria-hidden />
                    </span>
                    <span>
                      <span className="block text-[15px] font-bold">{l.titulo}</span>
                      <span className="block text-sm text-white/75 leading-relaxed">{l.texto}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MARCA.logotipo}
            alt={`${MARCA.nombre}, ${MARCA.lema.toLowerCase()}`}
            width={1200}
            height={254}
            className="-ml-1 block h-auto w-[164px] sm:w-[190px] lg:w-[230px]"
          />
        </div>
      </section>

      {/* ─── El formulario ────────────────────────────────────────────── */}
      <main className="puerta-hoja relative -mt-6 flex min-h-[calc(62dvh+1.5rem)] flex-col rounded-t-3xl bg-white lg:mt-0 lg:min-h-dvh lg:rounded-none">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-8 pb-8 sm:px-8 lg:justify-center lg:py-12">
          {children}
        </div>
        <footer className="px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-slate-500">
          {MARCA.nombre} · {MARCA.lema} · {MARCA.ciudad}
        </footer>
      </main>
    </div>
  );
}
