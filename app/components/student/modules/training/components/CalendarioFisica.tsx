'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, X, StickyNote, Loader2, CalendarDays } from 'lucide-react';
import { getMiFisica, setMiApunte } from '@/actions';
import {
  ETIQUETA_TIPO, diasDeSemana, semanasDelMes, sumaMeses, mesDe, etiquetaMes, porDia, resumenSemana,
  estadoSesion, formateaMinutos, formateaKm, type Sesion, type Apunte,
} from '@/app/lib/sesiones';
import { sumaDias } from '@/app/lib/asistencia';
import { ESTILO_TIPO } from '@/app/components/fisica/estiloTipo';
import { Card, EmptyState, TEXT, cx } from '../../../../ui';
import DetalleSesion from './DetalleSesion';

/**
 * EL CALENDARIO DE FÍSICA DEL ALUMNO (regla 86).
 *
 * Como lo veía en la herramienta con la que su academia le mandaba la física:
 * el MES entero, cada día con sus sesiones en un recuadro del color de su tipo
 * (fuerza, carrera, agilidad…), y debajo de cada semana cuántas ha hecho. Toca
 * un día y salen sus sesiones; toca una y se abre para leerla y apuntarla.
 *
 * Junta las sesiones de sus grupos y las que le ha puesto el preparador solo a
 * él: para el alumno es un único calendario.
 */

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
// Caben unos 7 caracteres a 9 px en una séptima parte de un móvil.
const ETIQUETA_CORTA: Record<string, string> = { agilidad: 'Agil.', circuito: 'Circ.', movilidad: 'Movil.', descanso: 'Desc.' };
const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Hoy en el navegador, solo para el primer pintado; luego manda el del servidor. */
function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarioFisica() {
  const [mes, setMes] = useState(() => mesDe(hoyLocal()));
  const [hoy, setHoy] = useState(hoyLocal);
  const [diaSel, setDiaSel] = useState<string>(hoyLocal);
  const [datos, setDatos] = useState<{
    sesiones: Sesion[]; apuntes: Apunte[]; notas: { weekStart: string; note: string }[]; nombresGrupo: Record<string, string>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<Sesion | null>(null);

  const semanas = useMemo(() => semanasDelMes(mes), [mes]);
  const desde = semanas[0];
  const hasta = sumaDias(semanas[semanas.length - 1], 6);

  const cargar = useCallback(async () => {
    const res = await getMiFisica({ desde, hasta });
    if (!res.success) { setError(res.error); return; }
    setError(null);
    setHoy(res.hoy);
    setDatos({ sesiones: res.sesiones, apuntes: res.apuntes, notas: res.notas, nombresGrupo: res.nombresGrupo });
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const sesionesPorDia = useMemo(() => porDia(datos?.sesiones ?? []), [datos]);
  const apuntePorSesion = useMemo(() => new Map((datos?.apuntes ?? []).map((a) => [a.sessionId, a])), [datos]);

  function cambiaMes(n: number) {
    const nuevo = sumaMeses(mes, n);
    setMes(nuevo);
    setDiaSel(mesDe(hoy) === nuevo ? hoy : `${nuevo}-01`);
  }

  function irAHoy() {
    setMes(mesDe(hoy));
    setDiaSel(hoy);
  }

  function apunteGuardado(sessionId: string, apunte: Apunte | null) {
    setDatos((d) => d && {
      ...d,
      apuntes: [...d.apuntes.filter((a) => a.sessionId !== sessionId), ...(apunte ? [apunte] : [])],
    });
  }

  const delDia = sesionesPorDia.get(diaSel) ?? [];
  const nadaEnElMes = datos && datos.sesiones.length === 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-4 animate-in fade-in duration-150">
      <Card pad="sm">
        {/* El mes y cómo moverse por él. */}
        <div className="flex items-center gap-1 mb-2">
          <button onClick={() => cambiaMes(-1)} aria-label="Mes anterior" className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft size={18} />
          </button>
          <h2 className="flex-1 text-center text-lg font-black text-slate-900 dark:text-white capitalize">{etiquetaMes(mes)}</h2>
          <button onClick={() => cambiaMes(1)} aria-label="Mes siguiente" className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronRight size={18} />
          </button>
          <button onClick={irAHoy} className="min-h-[44px] px-3 rounded-xl text-xs font-black text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
            Hoy
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DIAS.map((d) => <span key={d} className="text-center text-[10px] font-black text-slate-400 dark:text-slate-500">{d}</span>)}
        </div>

        {!datos && !error && (
          <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
        )}
        {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400 py-6 text-center">{error}</p>}

        {datos && (
          <div className="space-y-2">
            {semanas.map((lunes) => {
              const dias = diasDeSemana(lunes);
              const deLaSemana = dias.flatMap((d) => sesionesPorDia.get(d) ?? []);
              const r = resumenSemana({ sesiones: deLaSemana, apuntes: datos.apuntes, hoy });
              const nota = datos.notas.find((n) => n.weekStart === lunes);
              return (
                <div key={lunes}>
                  {nota && (
                    <p className="mb-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/25 text-[11px] font-semibold text-indigo-800 dark:text-indigo-200 flex items-center gap-1.5 min-w-0">
                      <StickyNote size={12} className="shrink-0" /> <span className="truncate">{nota.note}</span>
                    </p>
                  )}
                  <div className="grid grid-cols-7 gap-1">
                    {dias.map((d) => {
                      const fuera = mesDe(d) !== mes;
                      const ses = sesionesPorDia.get(d) ?? [];
                      const sel = d === diaSel;
                      return (
                        <button
                          key={d}
                          onClick={() => setDiaSel(d)}
                          aria-pressed={sel}
                          aria-label={`${fechaLarga(d)}: ${ses.length} ${ses.length === 1 ? 'sesión' : 'sesiones'}`}
                          className={cx(
                            'min-h-[64px] rounded-xl p-0.5 flex flex-col items-stretch gap-0.5 border transition-colors min-w-0',
                            sel ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-900/20' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50',
                            fuera && 'opacity-40',
                          )}
                        >
                          <span className={cx(
                            'self-center text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-full tabular-nums',
                            d === hoy ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300',
                          )}>
                            {Number(d.slice(8))}
                          </span>
                          {ses.slice(0, 3).map((s) => {
                            const est = estadoSesion(s.fecha, apuntePorSesion.get(s.id), hoy);
                            const E = ESTILO_TIPO[s.kind];
                            const Icono = E.icono;
                            return (
                              <span
                                key={s.id}
                                className={cx(
                                  'relative rounded-md px-0.5 py-0.5 flex flex-col items-center min-w-0',
                                  E.chip,
                                  est === 'no_hecha' && 'opacity-50 line-through',
                                )}
                              >
                                <Icono size={12} className="shrink-0" />
                                <span className="text-[9px] font-bold leading-tight truncate max-w-full">
                                  {ETIQUETA_CORTA[s.kind] ?? ETIQUETA_TIPO[s.kind]}
                                </span>
                                {est === 'hecha' && (
                                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                                    <Check size={9} strokeWidth={3} />
                                  </span>
                                )}
                              </span>
                            );
                          })}
                          {ses.length > 3 && <span className="text-[9px] font-bold text-slate-500 text-center">+{ses.length - 3}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {r.sesiones > 0 && (
                    <p className="mt-1 text-right text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                      {r.posibles > 0 ? `${r.hechas}/${r.posibles} hechas` : `${r.sesiones} ${r.sesiones === 1 ? 'sesión' : 'sesiones'}`}
                      {formateaMinutos(r.minutos) && ` · ${formateaMinutos(r.minutos)}`}
                      {formateaKm(r.kilometros) && ` · ${formateaKm(r.kilometros)}`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* El día elegido. */}
      {datos && (
        <section>
          <h3 className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 mb-2 capitalize')}>
            {d0(diaSel, hoy)}
          </h3>
          {nadaEnElMes ? (
            <EmptyState
              icon={<CalendarDays size={28} />}
              title="Aún no hay sesiones este mes"
              hint="Tu preparador las publica desde la academia. En cuanto las suba, aparecerán aquí."
            />
          ) : delDia.length === 0 ? (
            <p className={cx(TEXT.muted, 'px-1')}>No hay nada planificado este día.</p>
          ) : (
            <div className="space-y-2">
              {delDia.map((s) => (
                <TarjetaSesion
                  key={s.id}
                  s={s}
                  estado={estadoSesion(s.fecha, apuntePorSesion.get(s.id), hoy)}
                  apunte={apuntePorSesion.get(s.id) ?? null}
                  grupo={s.classId ? datos.nombresGrupo[s.classId] ?? 'Tu grupo' : null}
                  onAbrir={() => setAbierta(s)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {abierta && datos && (
        <DetalleSesion
          sesion={abierta}
          apunte={apuntePorSesion.get(abierta.id) ?? null}
          grupo={abierta.classId ? datos.nombresGrupo[abierta.classId] ?? 'Tu grupo' : null}
          hoy={hoy}
          onCerrar={() => setAbierta(null)}
          onGuardar={async (cambio) => {
            const res = await setMiApunte({ sessionId: abierta.id, ...cambio });
            if (!res.success) return { success: false, error: res.error };
            apunteGuardado(abierta.id, res.apunte);
            return { success: true };
          }}
        />
      )}
    </div>
  );
}

function d0(dia: string, hoy: string): string {
  if (dia === hoy) return `Hoy · ${fechaLarga(dia)}`;
  if (dia === sumaDias(hoy, 1)) return `Mañana · ${fechaLarga(dia)}`;
  if (dia === sumaDias(hoy, -1)) return `Ayer · ${fechaLarga(dia)}`;
  return fechaLarga(dia);
}

const ETIQUETA_ESTADO = {
  hecha: { texto: 'Hecha', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  no_hecha: { texto: 'No hecha', clase: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
  pendiente: { texto: 'Sin apuntar', clase: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  planificada: { texto: 'Planificada', clase: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
} as const;

export function TarjetaSesion({ s, estado, apunte, grupo, onAbrir }: {
  s: Sesion;
  estado: keyof typeof ETIQUETA_ESTADO;
  apunte: Apunte | null;
  grupo: string | null;
  onAbrir: () => void;
}) {
  const E = ESTILO_TIPO[s.kind];
  const Icono = E.icono;
  const meta = [formateaMinutos(s.durationMin), formateaKm(s.distanceKm)].filter(Boolean).join(' · ');
  return (
    <button
      onClick={onAbrir}
      className="w-full text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
    >
      <span className={cx('w-1.5 shrink-0', E.barra)} />
      <span className="flex-1 min-w-0 p-3 flex items-start gap-3">
        <span className={cx('w-9 h-9 shrink-0 rounded-xl flex items-center justify-center', E.chip)}>
          <Icono size={17} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-black text-slate-900 dark:text-white leading-snug">{s.title}</span>
          <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {ETIQUETA_TIPO[s.kind]}{meta && ` · ${meta}`} · {grupo ?? 'Solo para ti'}
          </span>
          {apunte?.coachReply && (
            <span className="block text-[11px] text-indigo-700 dark:text-indigo-300 mt-1 truncate">Tu preparador te ha contestado</span>
          )}
        </span>
        <span className={cx('shrink-0 text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1', ETIQUETA_ESTADO[estado].clase)}>
          {estado === 'hecha' && <Check size={11} strokeWidth={3} />}
          {estado === 'no_hecha' && <X size={11} strokeWidth={3} />}
          {ETIQUETA_ESTADO[estado].texto}
          {estado === 'hecha' && apunte?.rpe != null && <span className="font-mono">· {apunte.rpe}/10</span>}
        </span>
      </span>
    </button>
  );
}
