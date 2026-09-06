'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  PhoneCall, Loader2, AlertTriangle, ChevronDown, Layers, Target,
  BookOpen, GraduationCap, UserCheck, UserX, Clock, BadgeEuro, KeyRound,
} from 'lucide-react';
import {
  getAcademyOverview, getStudentDetail,
  setMemberAccess, setMembershipRequired, activateAllCurrentStudents, setStudentGroups,
} from '@/actions';
import type { AcademyOverview, StudentDetail } from '@/app/actions/academy';
import { ESTADO_ALUMNO_LABEL, DIAS_ABANDONO, type EstadoAlumno, type FilaAlumno } from '@/app/lib/academy';
import { ERROR_LABELS } from '@/app/lib/stats';
import { formateaPeriodo } from '@/app/lib/payments';
import { Card, SectionLabel, StatTile, Button, TEXT, cx } from '../../ui';

/**
 * «Alumnos» (P8) — un solo panel que junta lo que antes eran tres pestañas:
 * Usuarios (la cuenta), Academia (el progreso, a quién llamar) y Acceso & Pagos.
 *
 * Todo lo que se hace con un alumno se hace desde aquí, en su ficha: darle o
 * quitarle acceso, marcarle los grupos, ver en qué falla. El pago del mes se
 * marca en la pestaña «Pagos» (aquí solo se ve el aviso). El entrenamiento
 * físico vive en «Prep. física», por grupo.
 */

const ESTILO_ESTADO: Record<EstadoAlumno, string> = {
  nunca_entro: 'bg-slate-300/40 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300',
  abandonado: 'bg-red-500/10 text-red-700 dark:text-red-400',
  en_riesgo: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  activo: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

const ACCESO_BADGE: Record<FilaAlumno['acceso'], { label: string; cls: string; icon: typeof UserCheck }> = {
  active: { label: 'Acceso', cls: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10', icon: UserCheck },
  pending: { label: 'Sin activar', cls: 'text-amber-700 dark:text-amber-400 bg-amber-500/10', icon: Clock },
  suspended: { label: 'Suspendido', cls: 'text-red-700 dark:text-red-400 bg-red-500/10', icon: UserX },
};

export default function AdminStudents() {
  const [datos, setDatos] = useState<AcademyOverview | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [abierto, setAbierto] = useState<string | null>(null);
  const [ficha, setFicha] = useState<StudentDetail | null>(null);
  const [cargandoFicha, setCargandoFicha] = useState(false);

  const [filtroGrupo, setFiltroGrupo] = useState('');
  const SIN_GRUPO = '__sin__';

  const recargar = useCallback(async () => {
    const res = await getAcademyOverview();
    if (res.success) setDatos(res.data);
    else setError(res.error);
    setCargando(false);
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  async function accion(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    if (!res.success) setError(res.error ?? 'No se pudo guardar.');
    await recargar();
    setBusy(false);
  }

  async function abre(id: string) {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    setFicha(null);
    setCargandoFicha(true);
    const detalle = await getStudentDetail(id);
    setCargandoFicha(false);
    if (detalle.success) setFicha(detalle.data);
  }

  if (cargando) {
    return (
      <div className="py-32 flex flex-col items-center gap-4 opacity-60">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
        <p className="text-sm font-mono text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">Reuniendo la clase…</p>
      </div>
    );
  }
  if (error && !datos) {
    return (
      <div className="bg-red-500/5 border border-red-500/20 text-red-700 dark:text-red-300 rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
        <AlertTriangle size={16} /> {error}
      </div>
    );
  }
  if (!datos) return null;

  const { alumnos, porEstado, grupos, cobertura, sospechosas, membershipRequired, periodoActual } = datos;
  const sinBanco = cobertura.filter((c) => c.preguntas === 0);
  const pendientes = alumnos.filter((a) => a.acceso === 'pending').length;
  const pagadosMes = alumnos.filter((a) => a.pagadoMesActual).length;
  const conAcceso = alumnos.filter((a) => a.acceso === 'active').length;

  const hayAlgunSinGrupo = alumnos.some((a) => a.grupos.length === 0);
  const alumnosVistos =
    filtroGrupo === '' ? alumnos
    : filtroGrupo === SIN_GRUPO ? alumnos.filter((a) => a.grupos.length === 0)
    : alumnos.filter((a) => a.grupos.some((g) => g.id === filtroGrupo));

  return (
    <div className="space-y-4 animate-in fade-in pb-24">

      {/* --- CONTROL DE ACCESO GLOBAL --- */}
      <Card tone={membershipRequired ? 'brand' : 'sunken'} pad="md" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <KeyRound size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
            <div>
              <p className="font-black text-slate-900 dark:text-white text-sm">
                {membershipRequired ? 'Control de acceso ENCENDIDO' : 'Control de acceso apagado'}
              </p>
              <p className={cx(TEXT.muted, 'mt-0.5 max-w-md')}>
                {membershipRequired
                  ? 'Solo entran los alumnos con acceso. Un alumno nuevo se registra y espera a que le des acceso.'
                  : 'La plataforma está abierta para todos. Enciéndelo cuando quieras que solo entren los que pagan.'}
              </p>
            </div>
          </div>
          <Button size="sm" variant={membershipRequired ? 'secondary' : 'primary'} disabled={busy}
            onClick={() => accion(() => setMembershipRequired(!membershipRequired))}>
            {membershipRequired ? 'Apagar' : 'Encender'}
          </Button>
        </div>
        {membershipRequired && pendientes > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">Hay {pendientes} sin activar. Si son alumnos que ya tenías, dales acceso de golpe.</p>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => accion(async () => activateAllCurrentStudents())}>Activar a todos</Button>
          </div>
        )}
      </Card>

      {/* --- CIFRAS --- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <StatTile label="Con acceso" value={conAcceso} tone="success" />
        <StatTile label="Sin activar" value={pendientes} tone={pendientes ? 'warning' : 'neutral'} />
        <StatTile label="Nunca ha entrado" value={porEstado.nunca_entro} tone={porEstado.nunca_entro ? 'danger' : 'neutral'} />
        <StatTile label={`Pagó ${formateaPeriodo(periodoActual).split(' de ')[0]}`} value={`${pagadosMes}/${conAcceso}`} tone="brand" />
      </div>

      {/* --- FILTRO POR GRUPO --- */}
      {grupos.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <GraduationCap size={14} className="text-slate-500 dark:text-slate-400" />
          <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)}
            className="text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 font-semibold">
            <option value="">Todos los grupos ({alumnos.length})</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            {hayAlgunSinGrupo && <option value={SIN_GRUPO}>Sin grupo</option>}
          </select>
          <span className="text-[11px] text-slate-400">Los grupos se definen en «Grupos»; aquí se asignan.</span>
        </div>
      )}

      {/* --- LA LISTA --- */}
      <p className={cx(TEXT.muted)}>{alumnos.length} personas · abandono a partir de {DIAS_ABANDONO} días sin entrar</p>
      <div className="space-y-2">
        {alumnosVistos.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">Nadie aquí.</p>}
        {alumnosVistos.map((a) => (
          <FilaAlumnoUI
            key={a.id}
            a={a}
            grupos={grupos}
            periodo={periodoActual}
            estaAbierto={abierto === a.id}
            ficha={abierto === a.id ? ficha : null}
            cargandoFicha={abierto === a.id && cargandoFicha}
            busy={busy}
            onAbrir={() => abre(a.id)}
            onAccion={accion}
          />
        ))}
      </div>

      {/* --- SALUD DEL CONTENIDO (de Academia) --- */}
      <Card tone="contrast" className="mt-6">
        <SectionLabel icon={<BookOpen size={12} />}>El temario</SectionLabel>
        <p className={cx(TEXT.muted, 'mb-2')}>
          <span className="font-black text-amber-700 dark:text-amber-400">{sinBanco.length}</span>{' '}
          {sinBanco.length === 1 ? 'tema sin ninguna pregunta' : 'temas sin ninguna pregunta'}: no se pueden estudiar aunque el alumno quiera.
        </p>
        <div className="max-h-40 overflow-y-auto text-xs text-slate-500 dark:text-slate-400 space-y-1">
          {sinBanco.slice(0, 20).map((c) => <p key={c.subjectId} className="leading-snug">· {c.title}</p>)}
          {sinBanco.length > 20 && <p>…y {sinBanco.length - 20} más</p>}
        </div>
      </Card>

      <Card tone="contrast">
        <SectionLabel icon={<AlertTriangle size={12} />}>Preguntas que falla casi todo el mundo</SectionLabel>
        <p className={cx(TEXT.muted, 'mb-3 leading-relaxed')}>
          No son «las difíciles»: con suficientes intentos, una pregunta que casi nadie acierta suele estar mal redactada.
        </p>
        {sospechosas.length === 0 && <p className={TEXT.muted}>Ninguna, de momento.</p>}
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {sospechosas.map((p) => (
            <div key={p.questionId} className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3">
              <div className="flex flex-wrap items-center gap-x-2 mb-1">
                <span className="text-[10px] font-black text-red-700 dark:text-red-400">{p.winRate}%</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{p.aciertos}/{p.veces}</span>
                {p.tema && <span className="text-[10px] text-slate-500 dark:text-slate-400">· {p.tema}</span>}
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">
                {p.texto ?? <span className="italic text-slate-500 dark:text-slate-400">Ya no está en el banco</span>}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function FilaAlumnoUI({
  a, grupos, periodo, estaAbierto, ficha, cargandoFicha, busy, onAbrir, onAccion,
}: {
  a: FilaAlumno;
  grupos: { id: string; name: string; kind: string }[];
  periodo: string;
  estaAbierto: boolean;
  ficha: StudentDetail | null;
  cargandoFicha: boolean;
  busy: boolean;
  onAbrir: () => void;
  onAccion: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;
}) {
  const badge = ACCESO_BADGE[a.acceso];
  const Icon = badge.icon;
  const [gruposSel, setGruposSel] = useState<Set<string>>(new Set(a.grupos.map((g) => g.id)));
  useEffect(() => { setGruposSel(new Set(a.grupos.map((g) => g.id))); }, [a.grupos]);
  const gruposSucios = gruposSel.size !== a.grupos.length || a.grupos.some((g) => !gruposSel.has(g.id));

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <button onClick={onAbrir} className="w-full text-left p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={cx('text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider', ESTILO_ESTADO[a.estado])}>
              {ESTADO_ALUMNO_LABEL[a.estado]}
            </span>
            <span className={cx('text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1', badge.cls)}><Icon size={10} /> {badge.label}</span>
            {a.grupos.map((g) => (
              <span key={g.id} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-400 flex items-center gap-1">
                <GraduationCap size={10} /> {g.name}
              </span>
            ))}
            {a.acceso === 'active' && (
              a.pagadoMesActual
                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><BadgeEuro size={10} /> pagó</span>
                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 flex items-center gap-1"><BadgeEuro size={10} /> debe {formateaPeriodo(periodo).split(' de ')[0]}</span>
            )}
            {(a.estado === 'abandonado' || a.estado === 'nunca_entro') && (
              <span className="text-[10px] font-bold text-red-700 dark:text-red-400/80 flex items-center gap-1"><PhoneCall size={10} /> llamar</span>
            )}
          </div>
          <p className="font-bold text-slate-900 dark:text-white break-all line-clamp-2 leading-snug">{a.email ?? a.id}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {a.diasSinEntrar === null ? 'Sin entrar ni una vez' : a.diasSinEntrar === 0 ? 'Entró hoy' : `Entró hace ${a.diasSinEntrar} días`}
            {' · '}
            {a.contestadas === 0 ? 'ningún test' : `${a.winRate ?? '—'}% de acierto en ${a.contestadas}`}
          </p>
        </div>
        <ChevronDown size={18} className={cx('text-slate-400 shrink-0 transition-transform', estaAbierto && 'rotate-180')} />
      </button>

      {estaAbierto && (
        <div className="px-4 pb-4 border-t border-slate-200 dark:border-slate-800 pt-4 space-y-5">

          {/* ACCESO */}
          <div className="flex flex-wrap gap-2">
            {a.acceso !== 'active' && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAccion(() => setMemberAccess(a.id, 'active'))}>Dar acceso</Button>
            )}
            {a.acceso !== 'suspended' && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAccion(() => setMemberAccess(a.id, 'suspended'))}>Suspender</Button>
            )}
          </div>

          {/* GRUPOS — casillas en el alumno */}
          <div>
            <SectionLabel icon={<GraduationCap size={13} />}>Grupos</SectionLabel>
            {grupos.length === 0 ? (
              <p className={TEXT.muted}>Aún no hay grupos. Créalos en la pestaña «Grupos».</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {grupos.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={gruposSel.has(g.id)} onChange={(e) => {
                        const s = new Set(gruposSel);
                        if (e.target.checked) s.add(g.id); else s.delete(g.id);
                        setGruposSel(s);
                      }} />
                      <span className="text-slate-700 dark:text-slate-300">{g.name}</span>
                    </label>
                  ))}
                </div>
                {gruposSucios && (
                  <Button size="sm" className="mt-2" disabled={busy} onClick={() => onAccion(() => setStudentGroups(a.id, [...gruposSel]))}>Guardar grupos</Button>
                )}
              </>
            )}
          </div>

          {/* PAGO DEL MES — solo aviso. Se marca en «Pagos». */}
          {a.acceso === 'active' && (
            <p className={cx(TEXT.muted, 'flex items-center gap-2')}>
              <BadgeEuro size={13} className="shrink-0" />
              {a.pagadoMesActual
                ? <>Pagó {formateaPeriodo(periodo)}.</>
                : <>Sin pagar {formateaPeriodo(periodo)}. Se marca en la pestaña «Pagos».</>}
            </p>
          )}

          {/* FICHA: en qué falla */}
          {cargandoFicha && <p className="text-xs text-slate-500 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Abriendo la ficha…</p>}
          {!cargandoFicha && ficha && (
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <SectionLabel icon={<Layers size={11} />}>Temas, del peor al mejor</SectionLabel>
                {ficha.temas.length === 0 && <p className={TEXT.muted}>Todavía no ha contestado ninguna pregunta.</p>}
                <div className="space-y-2">
                  {ficha.temas.slice(0, 8).map((t) => (
                    <div key={t.topic} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{t.topic}</p>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-1 overflow-hidden">
                          <div className={cx('h-full rounded-full', t.winRate < 50 ? 'bg-red-500' : t.winRate < 75 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${t.winRate}%` }} />
                        </div>
                      </div>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 shrink-0">{t.winRate}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel icon={<Target size={11} />}>Cómo se equivoca</SectionLabel>
                {ficha.errores.porTipo.length === 0 && ficha.errores.sinClasificar === 0 && <p className={TEXT.muted}>Sin fallos registrados.</p>}
                <div className="space-y-1.5">
                  {ficha.errores.porTipo.map((e) => (
                    <div key={e.tipo} className="flex justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300">{ERROR_LABELS[e.tipo] ?? e.tipo}</span>
                      <span className="font-mono text-slate-500 dark:text-slate-400">{e.veces}</span>
                    </div>
                  ))}
                  {ficha.errores.sinClasificar > 0 && (
                    <div className="flex justify-between text-xs pt-1.5 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 italic">Sin diagnosticar</span>
                      <span className="font-mono text-slate-500 dark:text-slate-400">{ficha.errores.sinClasificar}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
