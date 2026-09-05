'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users, PhoneCall, Loader2, AlertTriangle, ChevronDown,
  BookOpen, Target, Layers, GraduationCap, Check,
} from 'lucide-react';
import { getAcademyOverview, getStudentDetail, getStudentActivePlan, saveManualTrainingPlan, setStudentClass } from '@/actions';
import { Dumbbell } from 'lucide-react';
import PlanEntrenadorEditor from './PlanEntrenadorEditor';
import type { AcademyOverview, StudentDetail } from '@/app/actions/academy';
import { ESTADO_ALUMNO_LABEL, DIAS_ABANDONO, type EstadoAlumno } from '@/app/lib/academy';
import { ERROR_LABELS } from '@/app/lib/stats';
import { Card } from '../../ui';

/**
 * El panel de la academia (P5).
 *
 * La regla de esta pantalla es la del plan: **información, no adornos**. Un
 * panel con veinte números iguales no es más avanzado, es más ruidoso. Aquí
 * todo lo que se pinta responde a una de tres preguntas: a quién llamo, en qué
 * falla, y qué parte del temario no le sirve a nadie.
 */

const ESTILO_ESTADO: Record<EstadoAlumno, string> = {
  nunca_entro: 'bg-slate-300/40 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300 border-slate-600/40',
  abandonado: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25',
  en_riesgo: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
  activo: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
};

/** El orden en el que se enseñan los cuatro números: primero lo accionable. */
const ORDEN_ESTADOS: EstadoAlumno[] = ['nunca_entro', 'abandonado', 'en_riesgo', 'activo'];

function Cifra({ n, etiqueta, alerta }: { n: number; etiqueta: string; alerta?: boolean }) {
  return (
    <div
      className={`flex-1 min-w-[130px] rounded-2xl px-4 py-3 border ${
        alerta && n > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
      }`}
    >
      <p className={`text-3xl font-black ${alerta && n > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>{n}</p>
      <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-bold mt-0.5">{etiqueta}</p>
    </div>
  );
}

/**
 * Poner o cambiar la clase/promoción de un alumno (P5f). Texto libre: «vaciar
 * y guardar» le quita la clase (`normalizeClase` lo convierte en `null`).
 */
function ClaseEditor({
  claseActual,
  onGuardar,
}: {
  claseActual: string | null;
  onGuardar: (valor: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const [valor, setValor] = useState(claseActual ?? '');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const sucio = valor.trim() !== (claseActual ?? '');

  async function guardar() {
    setGuardando(true);
    setGuardado(false);
    const res = await onGuardar(valor);
    setGuardando(false);
    if (res.success) {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 1500);
    }
  }

  return (
    <div className="mb-5 flex items-center gap-2 flex-wrap">
      <GraduationCap size={13} className="text-slate-500 dark:text-slate-400 shrink-0" />
      <input
        type="text"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Clase o promoción (p. ej. Promoción 2026)"
        className="flex-1 min-w-[10rem] text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
      />
      <button
        onClick={guardar}
        disabled={!sucio || guardando}
        className="shrink-0 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 disabled:opacity-40 flex items-center gap-1.5"
      >
        {guardado ? <><Check size={12} /> Guardado</> : guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}

export default function AdminAcademy() {
  const [datos, setDatos] = useState<AcademyOverview | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [abierto, setAbierto] = useState<string | null>(null);
  const [ficha, setFicha] = useState<StudentDetail | null>(null);
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof getStudentActivePlan>>['plan'] | undefined>(undefined);
  const [cargandoFicha, setCargandoFicha] = useState(false);

  /** '' = todas. '__sin__' = las que no tienen clase asignada (P5f). */
  const SIN_CLASE = '__sin__';
  const [filtroClase, setFiltroClase] = useState('');

  const recargar = useCallback(async () => {
    const res = await getAcademyOverview();
    if (res.success) setDatos(res.data);
    else setError(res.error);
    setCargando(false);
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function abre(id: string) {
    if (abierto === id) {
      setAbierto(null);
      return;
    }
    setAbierto(id);
    setFicha(null);
    setPlan(undefined);
    setCargandoFicha(true);
    const [detalle, planRes] = await Promise.all([getStudentDetail(id), getStudentActivePlan(id)]);
    setCargandoFicha(false);
    if (detalle.success) setFicha(detalle.data);
    else setError(detalle.error);
    // `undefined` mientras se carga, `null` si de verdad no hay plan: no es lo
    // mismo «todavía no lo sé» que «no tiene» (regla 8).
    setPlan(planRes.success ? planRes.plan : null);
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

  const { alumnos, porEstado, clases, cobertura, sospechosas } = datos;
  const sinBanco = cobertura.filter((c) => c.preguntas === 0);
  const sinAlumnos = cobertura.filter((c) => c.preguntas > 0 && c.alumnos === 0);

  const hayAlgunSinClase = alumnos.some((a) => a.role !== 'admin' && !a.clase);
  const alumnosVistos =
    filtroClase === '' ? alumnos
    : filtroClase === SIN_CLASE ? alumnos.filter((a) => !a.clase)
    : alumnos.filter((a) => a.clase === filtroClase);

  return (
    <div className="space-y-8 animate-in fade-in pb-24">

      {/* --- A QUIÉN HAY QUE LLAMAR --- */}
      <div className="bg-slate-100/80 dark:bg-slate-900/80 border border-white/10 p-6 rounded-3xl space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-sky-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
            <Users size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight uppercase">La clase</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {alumnos.length} {alumnos.length === 1 ? 'persona' : 'personas'} · se considera abandono a
              partir de {DIAS_ABANDONO} días sin entrar
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {ORDEN_ESTADOS.map((e) => (
            <Cifra
              key={e}
              n={porEstado[e]}
              etiqueta={ESTADO_ALUMNO_LABEL[e]}
              alerta={e === 'abandonado' || e === 'nunca_entro'}
            />
          ))}
        </div>
      </div>

      {/* --- FILTRO POR CLASE (P5f) --- */}
      {(clases.length > 0 || hayAlgunSinClase) && (
        <div className="flex items-center gap-2 flex-wrap">
          <GraduationCap size={14} className="text-slate-500 dark:text-slate-400" />
          <select
            value={filtroClase}
            onChange={(e) => setFiltroClase(e.target.value)}
            className="text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 font-semibold"
          >
            <option value="">Todas las clases ({alumnos.length})</option>
            {clases.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            {hayAlgunSinClase && <option value={SIN_CLASE}>Sin clase asignada</option>}
          </select>
          {filtroClase !== '' && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{alumnosVistos.length} de {alumnos.length}</span>
          )}
        </div>
      )}

      {/* --- LISTA, ORDENADA POR URGENCIA --- */}
      <div className="space-y-3">
        {alumnosVistos.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">Nadie en esta clase.</p>
        )}
        {alumnosVistos.map((a) => {
          const estaAbierto = abierto === a.id;
          return (
            <div key={a.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
              <button onClick={() => abre(a.id)} className="w-full text-left p-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${ESTILO_ESTADO[a.estado]}`}>
                      {ESTADO_ALUMNO_LABEL[a.estado]}
                    </span>
                    {a.role === 'admin' && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                        admin
                      </span>
                    )}
                    {a.clase && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400 flex items-center gap-1">
                        <GraduationCap size={10} /> {a.clase}
                      </span>
                    )}
                    {(a.estado === 'abandonado' || a.estado === 'nunca_entro') && (
                      <span className="text-[10px] font-bold text-red-700 dark:text-red-400/80 flex items-center gap-1">
                        <PhoneCall size={10} /> llamar
                      </span>
                    )}
                    {/* Viene, pero no hace nada. No es lo mismo que no venir, y
                        es el que más se puede salvar. */}
                    {a.estado === 'activo' && a.estudiando === 'nunca' && (
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        entra y no hace tests
                      </span>
                    )}
                  </div>
                  {/* `break-all` + dos lineas: un correo recortado no
                      identifica a nadie, y esta lista existe justo para saber
                      A QUIEN llamar. Medido: le faltaban 149px. */}
                  <p className="font-bold text-slate-900 dark:text-white break-all line-clamp-2 leading-snug">{a.email ?? a.id}</p>

                  {/* LAS DOS FECHAS, SEPARADAS. «Viene» y «estudia» son cosas
                      distintas y piden llamadas distintas: al que no viene se
                      le pregunta si sigue interesado; al que viene todos los
                      días y no contesta ni una pregunta se le pregunta si se
                      ha atascado — y ese es de los que más se pueden salvar y
                      antes se pierden.

                      Antes solo se enseñaba una, y encima era la equivocada:
                      «nunca ha entrado» salía de no haber contestado. */}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {a.diasSinEntrar === null
                      ? 'Sin entrar ni una vez'
                      : a.diasSinEntrar === 0
                        ? 'Entró hoy'
                        : `Entró hace ${a.diasSinEntrar} ${a.diasSinEntrar === 1 ? 'día' : 'días'}`}
                    {' · '}
                    {a.contestadas === 0 && a.blancos === 0
                      ? 'ningún test'
                      : a.diasSinEstudiar === null
                        ? 'ningún test'
                        : `último test hace ${a.diasSinEstudiar} ${a.diasSinEstudiar === 1 ? 'día' : 'días'}`}
                  </p>
                </div>

                <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
                  <div>
                    <p className="text-lg font-black text-slate-700 dark:text-slate-300">
                      {a.diasSinEntrar === null ? '—' : a.diasSinEntrar}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-bold">días fuera</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-slate-700 dark:text-slate-300">{a.contestadas}</p>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-bold">respuestas</p>
                  </div>
                  <div>
                    {/* `null` no es 0 %: es que todavía no ha contestado nada. */}
                    <p className="text-lg font-black text-slate-700 dark:text-slate-300">
                      {a.winRate === null ? '—' : `${a.winRate}%`}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-bold">acierto</p>
                  </div>
                </div>

                <ChevronDown size={18} className={`text-slate-500 dark:text-slate-400 shrink-0 transition-transform ${estaAbierto ?'rotate-180' : ''}`} />
              </button>

              {estaAbierto && (
                <div className="px-5 pb-5 border-t border-slate-800/60 pt-5 animate-in fade-in slide-in-from-top-2 duration-200">
                  {a.role !== 'admin' && (
                    <ClaseEditor
                      claseActual={a.clase}
                      onGuardar={async (valor) => {
                        const res = await setStudentClass(a.id, valor);
                        if (res.success) await recargar();
                        return res;
                      }}
                    />
                  )}

                  {cargandoFicha && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Loader2 size={12} className="animate-spin" /> Abriendo la ficha…
                    </p>
                  )}

                  {!cargandoFicha && ficha && (
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                          <Layers size={11} /> Temas, del peor al mejor
                        </p>
                        {ficha.temas.length === 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">Todavía no ha contestado ninguna pregunta.</p>
                        )}
                        <div className="space-y-2">
                          {ficha.temas.slice(0, 8).map((t) => (
                            <div key={t.topic} className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{t.topic}</p>
                                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-1 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${t.winRate < 50 ? 'bg-red-500' : t.winRate < 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${t.winRate}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 shrink-0 w-20 text-right">
                                {t.winRate}% · {t.contestadas}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                          <Target size={11} /> Cómo se equivoca
                        </p>
                        {ficha.errores.porTipo.length === 0 && ficha.errores.sinClasificar === 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">Sin fallos registrados.</p>
                        )}
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

                  {/* EL PLAN DE ENTRENAMIENTO.
                      Va aquí y no en el módulo de entrenamiento del alumno
                      porque esto lo escribe/revisa el PROFESOR sobre UN
                      alumno concreto — es la misma lógica que las notas de
                      una pregunta: de quién es, se ve donde está esa persona. */}
                  {ficha?.alumno && (
                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                        <Dumbbell size={11} /> Plan de entrenamiento
                      </p>
                      <PlanEntrenadorEditor
                        studentId={a.id}
                        planActual={plan}
                        onGuardado={async () => {
                          const res = await getStudentActivePlan(a.id);
                          setPlan(res.success ? res.plan : null);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* --- EL CONTENIDO --- */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card tone="contrast">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
            <BookOpen size={12} /> El temario
          </p>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-black text-amber-700 dark:text-amber-400">{sinBanco.length}</span>{' '}
            {sinBanco.length === 1 ? 'tema sin ninguna pregunta: no se puede' : 'temas sin ninguna pregunta: no se pueden'}{' '}
            estudiar aunque el alumno quiera.
          </p>
          <div className="max-h-40 overflow-y-auto text-xs text-slate-500 dark:text-slate-400 space-y-1 mb-5">
            {/* Sin `truncate`: la caja ya tiene scroll propio (`max-h-40`), asi
                que envolver no la descuadra, y un titulo a medias no dice que
                tema esta sin preguntas — que es el unico dato de esta lista. */}
            {sinBanco.slice(0, 20).map((c) => <p key={c.subjectId} className="leading-snug">· {c.title}</p>)}
            {sinBanco.length > 20 && <p className="text-slate-500 dark:text-slate-400">…y {sinBanco.length - 20} más</p>}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-black text-slate-200">{sinAlumnos.length}</span>{' '}
            {sinAlumnos.length === 1 ? 'tema con preguntas que' : 'temas con preguntas que'} no ha tocado
            nadie: contenido preparado que no le sirve a ninguno.
          </p>
          <div className="max-h-32 overflow-y-auto text-xs text-slate-500 dark:text-slate-400 space-y-1">
            {sinAlumnos.slice(0, 12).map((c) => (
              <p key={c.subjectId} className="leading-snug">· {c.title} <span className="text-slate-500 dark:text-slate-400">({c.preguntas})</span></p>
            ))}
          </div>
        </Card>

        <Card tone="contrast">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
            <AlertTriangle size={12} /> Preguntas que falla casi todo el mundo
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
            No son «las difíciles»: con suficientes intentos, una pregunta que casi nadie acierta suele
            estar mal redactada o tener marcada la opción equivocada.
          </p>

          {sospechosas.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ninguna, de momento. Hacen falta unas cuantas respuestas por pregunta para poder decirlo.
            </p>
          )}

          <div className="space-y-3 max-h-72 overflow-y-auto">
            {sospechosas.map((p) => (
              <div key={p.questionId} className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
                  <span className="text-[10px] font-black text-red-700 dark:text-red-400">{p.winRate}%</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{p.aciertos}/{p.veces}</span>
                  {p.tema && <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">· {p.tema}</span>}
                </div>
                <p className="text-xs text-slate-200 leading-snug">
                  {p.texto ?? <span className="italic text-slate-500 dark:text-slate-400">Ya no está en el banco</span>}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
