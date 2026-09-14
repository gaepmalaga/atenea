import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Building2, UserRound } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Demo para academias · Atenea',
  description: 'Elige qué vista quieres ver: el panel de una academia o lo que ve un alumno.',
};

const C = {
  fondo: 'bg-[#f7f4ee]',
  tinta: 'text-[#111820]',
  tinta2: 'text-[#3d4a5a]',
  rojo: 'bg-[#c60b1e]',
} as const;

export default function DemoHubPage() {
  return (
    <main className={`min-h-dvh flex flex-col ${C.fondo} ${C.tinta}`}>
      <div
        className="h-1.5 shrink-0"
        style={{ background: 'linear-gradient(to right,#c60b1e 0 22%,#ffc400 22% 78%,#c60b1e 78% 100%)' }}
        aria-hidden
      />

      <div className="flex-1 px-5 py-10 sm:py-16 max-w-lg w-full mx-auto flex flex-col">
        <Link href="/academias" className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider ${C.tinta2} mb-8`}>
          <ArrowLeft size={13} aria-hidden /> Volver a la información
        </Link>

        <h1 className="text-3xl sm:text-4xl font-black uppercase leading-[0.95] tracking-[-0.03em] mb-3">
          ¿Qué quieres ver primero?
        </h1>
        <p className={`text-[15px] font-semibold leading-relaxed mb-10 ${C.tinta2}`}>
          Las dos vistas son de solo lectura, con datos de ejemplo — nada de lo que toques se guarda.
        </p>

        <div className="space-y-4">
          <Link
            href="/academias/demo/academia"
            className="group flex items-center gap-4 border-[3px] border-[#111820] bg-white px-5 py-6 hover:bg-[#111820] hover:text-white transition-colors"
          >
            <Building2 size={28} className="shrink-0" aria-hidden />
            <span className="flex-1">
              <span className="block text-lg font-black uppercase tracking-tight">Como academia</span>
              <span className={`block text-[13px] font-semibold ${C.tinta2} group-hover:text-white/70`}>
                Alumnos, grupos, pagos y dominio del temario
              </span>
            </span>
            <ArrowRight size={20} className="shrink-0" aria-hidden />
          </Link>

          <Link
            href="/academias/demo/alumno"
            className="group flex items-center gap-4 border-[3px] border-[#111820] bg-white px-5 py-6 hover:bg-[#111820] hover:text-white transition-colors"
          >
            <UserRound size={28} className="shrink-0" aria-hidden />
            <span className="flex-1">
              <span className="block text-lg font-black uppercase tracking-tight">Como alumno</span>
              <span className={`block text-[13px] font-semibold ${C.tinta2} group-hover:text-white/70`}>
                Entrenamiento adaptativo, ¿aprobaría? y dominio del temario
              </span>
            </span>
            <ArrowRight size={20} className="shrink-0" aria-hidden />
          </Link>
        </div>
      </div>
    </main>
  );
}
