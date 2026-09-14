import type { Metadata } from 'next';
import { Play, Target, Flame, GraduationCap, History } from 'lucide-react';
import { Card, PageHeader, SectionLabel, StatTile, TEXT, cx } from '@/app/components/ui';
import DemoBanner from '../DemoBanner';
import { ALUMNO_DEMO, DOMINIO_TEMARIO_DEMO } from '../fixtures';

export const metadata: Metadata = {
  title: 'Demo — panel de alumno · Atenea',
  description: 'Vista de solo lectura de lo que ve un alumno en Atenea, con datos de ejemplo.',
};

export default function DemoAlumnoPage() {
  const a = ALUMNO_DEMO;

  return (
    <div className="min-h-dvh bg-app">
      <DemoBanner vista="Alumno" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <PageHeader title={a.nombre} subtitle="Lo que ve un alumno al entrar cada día" />

        {/* CTA DEL DÍA — igual que Inicio en la app real */}
        <Card tone="brand" pad="lg" elevation="raised" className="relative overflow-hidden mb-6">
          <div className="absolute -top-24 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <p className={cx(TEXT.label, 'text-indigo-200')}>Hoy</p>
              <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider bg-white/15 px-2 py-0.5 rounded-full">
                <Flame size={12} /> {a.racha} días seguidos
              </span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black mb-3 leading-tight tracking-tight">A entrenar.</h2>
            <p className="text-indigo-100 text-sm sm:text-base font-medium max-w-xl mb-6 leading-relaxed">
              Hoy te tocan <strong className="text-white">{a.proximaSesion.total} preguntas</strong>:{' '}
              {a.proximaSesion.nuevas} nuevas, {a.proximaSesion.vencidas} vencidas y {a.proximaSesion.refuerzo} de refuerzo —
              calibradas para que aciertes alrededor del 85 %.
            </p>
            <span className="inline-flex bg-white text-indigo-600 px-6 py-4 rounded-xl font-black uppercase text-xs tracking-widest items-center gap-3 min-h-[44px]">
              <Play size={18} fill="currentColor" /> Entrenar
            </span>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8 sm:mb-10">
          <StatTile label="Acierto" value={a.acierto} suffix="%" tone="brand" icon={<Target size={12} />} />
          <StatTile label="Racha" value={a.racha} suffix=" días" tone="neutral" icon={<Flame size={12} />} />
          <StatTile label="En blanco" value={a.enBlanco} tone="warning" />
        </div>

        <section className="mb-8 sm:mb-10">
          <SectionLabel icon={<GraduationCap size={13} />}>¿Aprobaría?</SectionLabel>
          <Card className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-4xl font-black tabular-nums text-slate-900 dark:text-white">{a.aprobaria.nota.toFixed(1)}</p>
              <p className={TEXT.muted}>Media de {a.aprobaria.simulacros} simulacros, nota real de la convocatoria</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">{a.aprobaria.mejor.toFixed(1)}</p>
              <p className={TEXT.muted}>Mejor marca</p>
            </div>
          </Card>
        </section>

        <section className="mb-8 sm:mb-10">
          <SectionLabel>Dominio del temario</SectionLabel>
          <Card className="space-y-4">
            {DOMINIO_TEMARIO_DEMO.slice(0, 3).map((t) => {
              const total = t.dominada + t.consolidando + t.aprendiendo + t.sinEmpezar;
              return (
                <div key={t.tema}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{t.tema}</p>
                    <p className="text-xs font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                      {Math.round((t.dominada / total) * 100)}% dominado
                    </p>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                    <div style={{ width: `${(t.dominada / total) * 100}%` }} className="bg-emerald-500" />
                    <div style={{ width: `${(t.consolidando / total) * 100}%` }} className="bg-indigo-500" />
                    <div style={{ width: `${(t.aprendiendo / total) * 100}%` }} className="bg-amber-400" />
                    <div style={{ width: `${(t.sinEmpezar / total) * 100}%` }} className="bg-slate-300 dark:bg-slate-700" />
                  </div>
                </div>
              );
            })}
          </Card>
        </section>

        <section>
          <SectionLabel icon={<History size={13} />}>Lo último</SectionLabel>
          <div className="space-y-2">
            {a.ultimaActividad.map((item) => (
              <Card key={item.texto} pad="sm" className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{item.texto}</p>
                  <p className={TEXT.muted}>{item.cuando}</p>
                </div>
                <span className="text-sm font-black tabular-nums text-slate-900 dark:text-white shrink-0">{item.resultado}</span>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
