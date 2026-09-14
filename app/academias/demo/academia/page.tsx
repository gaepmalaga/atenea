import type { Metadata } from 'next';
import { Users, Wallet, TriangleAlert, Layers } from 'lucide-react';
import { Card, PageHeader, SectionLabel, StatTile, TEXT, cx } from '@/app/components/ui';
import DemoBanner from '../DemoBanner';
import {
  ALUMNOS_DEMO, GRUPOS_DEMO, DOMINIO_TEMARIO_DEMO, PAGOS_MES_DEMO,
  type AlumnoDemo, type EstadoAlumnoDemo, type PagoDemo,
} from '../fixtures';

export const metadata: Metadata = {
  title: 'Demo — panel de academia · Atenea',
  description: 'Vista de solo lectura del panel de administración de Atenea, con datos de ejemplo.',
};

const ESTADO_LABEL: Record<EstadoAlumnoDemo, string> = {
  activo: 'Activo',
  en_riesgo: 'En riesgo',
  abandonado: 'Abandonado',
  nunca_entro: 'Nunca ha entrado',
};

const ESTADO_ESTILO: Record<EstadoAlumnoDemo, string> = {
  activo: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  en_riesgo: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  abandonado: 'bg-red-500/10 text-red-700 dark:text-red-400',
  nunca_entro: 'bg-slate-300/40 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300',
};

const PAGO_LABEL: Record<PagoDemo, string> = { pagado: 'Al día', debe: 'Debe', exento: 'Exento' };
const PAGO_ESTILO: Record<PagoDemo, string> = {
  pagado: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  debe: 'bg-red-500/10 text-red-700 dark:text-red-400',
  exento: 'bg-slate-300/40 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300',
};

function FilaAlumno({ a }: { a: AlumnoDemo }) {
  return (
    <Card pad="sm" className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-black text-sm text-slate-900 dark:text-white truncate">{a.nombre}</p>
        <p className={cx(TEXT.muted, 'truncate')}>{a.correo}</p>
        {a.grupos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {a.grupos.map((g) => (
              <span key={g} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400">
                {g}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap sm:shrink-0">
        <div className="text-right">
          <p className="text-sm font-black tabular-nums text-slate-900 dark:text-white">
            {a.acierto === null ? '—' : `${a.acierto}%`}
          </p>
          <p className={cx(TEXT.muted, 'whitespace-nowrap')}>{a.contestadas} contestadas</p>
        </div>
        <span className={cx('text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap', ESTADO_ESTILO[a.estado])}>
          {ESTADO_LABEL[a.estado]}
        </span>
        <span className={cx('text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap', PAGO_ESTILO[a.pago])}>
          {PAGO_LABEL[a.pago]}
        </span>
      </div>
    </Card>
  );
}

function BarraDominio({ t }: { t: (typeof DOMINIO_TEMARIO_DEMO)[number] }) {
  const total = t.dominada + t.consolidando + t.aprendiendo + t.sinEmpezar;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{t.tema}</p>
        <p className="text-xs font-black tabular-nums text-emerald-600 dark:text-emerald-400">
          {Math.round((t.dominada / total) * 100)}% dominado
        </p>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
        <div style={{ width: seg(t.dominada) }} className="bg-emerald-500" title="Dominada" />
        <div style={{ width: seg(t.consolidando) }} className="bg-indigo-500" title="Consolidando" />
        <div style={{ width: seg(t.aprendiendo) }} className="bg-amber-400" title="En aprendizaje" />
        <div style={{ width: seg(t.sinEmpezar) }} className="bg-slate-300 dark:bg-slate-700" title="Sin empezar" />
      </div>
    </div>
  );
}

export default function DemoAcademiaPage() {
  const activos = ALUMNOS_DEMO.filter((a) => a.estado === 'activo').length;
  const enRiesgo = ALUMNOS_DEMO.filter((a) => a.estado === 'en_riesgo' || a.estado === 'abandonado').length;

  return (
    <div className="min-h-dvh bg-app">
      <DemoBanner vista="Academia" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <PageHeader
          title="Academia Demo"
          subtitle="Alumnos, grupos, pagos en efectivo y dominio del temario — todo en un panel"
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-8 sm:mb-10">
          <StatTile label="Alumnos activos" value={activos} tone="success" icon={<Users size={12} />} />
          <StatTile label="Cobrado este mes" value={PAGOS_MES_DEMO.cobrado} suffix=" €" tone="brand" icon={<Wallet size={12} />} />
          <StatTile label="En riesgo o fuera" value={enRiesgo} tone="warning" icon={<TriangleAlert size={12} />} />
          <StatTile label="Grupos activos" value={GRUPOS_DEMO.length} tone="neutral" icon={<Layers size={12} />} />
        </div>

        <section className="mb-8 sm:mb-10">
          <SectionLabel aside={<span className={TEXT.muted}>Ordenados por urgencia</span>}>Alumnos</SectionLabel>
          <div className="space-y-2">
            {ALUMNOS_DEMO.map((a) => <FilaAlumno key={a.id} a={a} />)}
          </div>
        </section>

        <section className="mb-8 sm:mb-10">
          <SectionLabel>Grupos</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {GRUPOS_DEMO.map((g) => (
              <Card key={g.nombre} pad="sm">
                <p className={cx(TEXT.label, 'text-indigo-600 dark:text-indigo-400')}>{g.tipo}</p>
                <p className="font-black text-sm text-slate-900 dark:text-white mt-1">{g.nombre}</p>
                <p className={cx(TEXT.muted, 'mt-1')}>
                  {g.alumnos} {g.alumnos === 1 ? 'alumno' : 'alumnos'} · {g.profesores.join(', ')}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-8 sm:mb-10">
          <SectionLabel aside={<span className={TEXT.muted}>{PAGOS_MES_DEMO.periodo}</span>}>Pagos</SectionLabel>
          <Card pad="sm" className="flex flex-wrap gap-x-6 gap-y-2">
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{PAGOS_MES_DEMO.pagados} pagados</span>
            <span className="text-sm font-bold text-red-700 dark:text-red-400">{PAGOS_MES_DEMO.porPagar} por pagar</span>
            <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{PAGOS_MES_DEMO.exentos} exento</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white ml-auto">{PAGOS_MES_DEMO.cobrado} € cobrados</span>
          </Card>
        </section>

        <section>
          <SectionLabel>Dominio del temario</SectionLabel>
          <Card className="space-y-4">
            {DOMINIO_TEMARIO_DEMO.map((t) => <BarraDominio key={t.tema} t={t} />)}
          </Card>
        </section>
      </div>
    </div>
  );
}
