import Link from 'next/link';
import { FlaskConical, ArrowLeft } from 'lucide-react';

/**
 * La franja que deja claro, en las dos pantallas de la demo, que nada de lo
 * que se ve viene de Supabase ni se puede romper tocándolo. Sin esto, un
 * dueño de academia que hace clic en un botón que no hace nada pensaría que
 * está roto, no que es una demo — el peor error posible en una herramienta
 * de venta.
 */
export default function DemoBanner({ vista }: { vista: 'Academia' | 'Alumno' }) {
  return (
    <div className="bg-[#111820] text-[#f7f4ee]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical size={14} className="shrink-0 text-[#ffc400]" aria-hidden />
          <p className="text-[11px] font-black uppercase tracking-[0.1em] truncate">
            Demo — vista de {vista} · datos de ejemplo, nada se guarda
          </p>
        </div>
        <Link
          href="/academias"
          className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#f7f4ee]/80 hover:text-[#f7f4ee] shrink-0"
        >
          <ArrowLeft size={13} aria-hidden />
          Volver
        </Link>
      </div>
    </div>
  );
}
