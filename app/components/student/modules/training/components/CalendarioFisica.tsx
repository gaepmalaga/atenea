'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, X, StickyNote, Loader2, CalendarDays, Users } from 'lucide-react';
import { getMiFisica, setMiApunte, setMiFalta, setMiUnion } from '@/actions';
import {
  ETIQUETA_TIPO, diasDeSemana, lunesDe, semanasDelMes, sumaMeses, mesDe, etiquetaMes, porDia, resumenSemana,
  estadoSesion, formateaMinutos, formateaKm, type Sesion, type Apunte,
} from '@/app/lib/sesiones';
import { sumaDias } from '@/app/lib/asistencia';
import { ESTILO_TIPO } from '@/app/components/fisica/estiloTipo';
import { Card, EmptyState, Interruptor, Kicker, TEXT, cx } from '../../../../ui';
import DetalleSesion from './DetalleSesion';
import type { RMVigente } from '@/app/actions/fisica';
import { clasesPorDia, type ClaseFisica } from '@/app/lib/clases-fisica';
import { colorDeGrupo } from '@/app/lib/cuadrante';
import TarjetaClase from '@/app/components/fisica/TarjetaClase';

/**
 * EL CALENDARIO DE FÍSICA DEL ALUMNO (regla 86).
 *
 * Como lo veía en la herramienta con la que su academia le mandaba la física:
 * el MES entero, cada día con sus sesiones en un recuadro del color de su tipo
 * (fuerza, carrera, agilidad…), y debajo de cada semana cuántas ha hecho. Toca
 * un día y salen sus sesiones; toca una y se abre para leerla y apuntarla.
 *
 * UN SOLO CALENDARIO CON DOS CAPAS (regla 97), que no se confunden:
 *   - sus CLASES de grupo: salen del horario aunque el preparador no haya
 *     escrito qué toca, con la hora y el profesor; las marcadas «sin clase»
 *     se ven así; aquí avisa de que falta (o, si es multi, se quita);
 *   - sus ENTRENOS: lo que le planifica el preparador a él solo.
 * La clase lleva el color de su grupo y la hora; el entreno, el de su tipo.
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
    sesiones: Sesion[]; clases: ClaseFisica[]; apuntes: Apunte[]; notas: { weekStart: string; note: string }[]; nombresGrupo: Record<string, string>; rm: RMVigente;
  } | null>(null);
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [errorClase, setErrorClase] = useState<string | null>(null);
  // Cada aviso sube la versión: una carga que salió antes y llega después
  // traería el estado viejo (el mismo fallo de «Mis clases», regla 82).
  const versionRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<Sesion | null>(null);
  // Por defecto la semana (lo que toca esta semana); el mes entero, a un botón.
  const [vista, setVista] = useState<'semana' | 'mes'>('semana');

  const semanas = useMemo(() => semanasDelMes(mes), [mes]);
  const desde = semanas[0];
  const hasta = sumaDias(semanas[semanas.length - 1], 6);

  const cargar = useCallback(async () => {
    const version = versionRef.current;
    const res = await getMiFisica({ desde, hasta });
    if (version !== versionRef.current) return;
    if (!res.success) { setError(res.error); return; }
    setError(null);
    setHoy(res.hoy);
    setDatos({ sesiones: res.sesiones, clases: res.clases, apuntes: res.apuntes, notas: res.notas, nombresGrupo: res.nombresGrupo, rm: res.rm });
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const sesionesPorDia = useMemo(() => porDia(datos?.sesiones ?? []), [datos]);
  const clasesDelDia = useMemo(() => clasesPorDia(datos?.clases ?? []), [datos]);
  /** Lo que cuenta para «N/M hechas»: los entrenos y las clases con sesión escrita. */
  const contables = useMemo(
    () => [...(datos?.sesiones ?? []), ...(datos?.clases ?? []).flatMap((c) => (c.sesion && !c.sinClase ? [c.sesion] : []))],
    [datos],
  );
  const contablesPorDia = useMemo(() => porDia(contables), [contables]);

  /** Avisa de que falta a una clase de su grupo, o se quita de la de otro grupo si es multi. */
  async function alternaClase(c: ClaseFisica) {
    const k = `${c.classId}|${c.fecha}`;
    versionRef.current += 1;
    setEnVuelo(k);
    setErrorClase(null);
    const res = c.origen === 'multi'
      ? await setMiUnion({ classId: c.classId, fecha: c.fecha, unir: false })
      : await setMiFalta({ classId: c.classId, fecha: c.fecha, falta: !c.falta });
    if (!res.success) setErrorClase(res.error ?? 'No se ha podido guardar.');
    else if (c.origen === 'multi') setDatos((d) => d && { ...d, clases: d.clases.filter((x) => `${x.classId}|${x.fecha}` !== k) });
    else setDatos((d) => d && { ...d, clases: d.clases.map((x) => (`${x.classId}|${x.fecha}` === k ? { ...x, falta: !c.falta } : x)) });
    setEnVuelo(null);
  }

  const tarjetaClase = (c: ClaseFisica) => (
    <TarjetaClase key={`${c.classId}|${c.fecha}`} clase={c} onAbrir={c.sesion ? () => setAbierta(c.sesion) : undefined}>
      {c.editable && (
        <button onClick={() => alternaClase(c)} disabled={enVuelo === `${c.classId}|${c.fecha}`} aria-pressed={c.origen === 'grupo' ? c.falta : undefined}
          className={cx('min-h-[44px] px-3 rounded-sm text-xs font-black border-2 transition-colors flex items-center gap-1.5',
            c.falta ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-400')}>
          {enVuelo === `${c.classId}|${c.fecha}` && <Loader2 size={12} className="animate-spin" />}
          {c.origen === 'multi' ? 'No voy · quitarme' : c.falta ? 'No voy · deshacer' : 'Aviso: no voy'}
        </button>
      )}
    </TarjetaClase>
  );
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

  /** Moverse una semana: el día elegido salta 7 y el mes cargado le sigue. */
  function cambiaSemana(n: number) {
    const nuevo = sumaDias(diaSel, 7 * n);
    setDiaSel(nuevo);
    setMes(mesDe(nuevo));
  }

  function apunteGuardado(sessionId: string, apunte: Apunte | null) {
    setDatos((d) => d && {
      ...d,
      apuntes: [...d.apuntes.filter((a) => a.sessionId !== sessionId), ...(apunte ? [apunte] : [])],
    });
  }

  const delDia = sesionesPorDia.get(diaSel) ?? [];
  const clasesSel = clasesDelDia.get(diaSel) ?? [];
  const nadaEnElMes = datos && datos.sesiones.length === 0 && datos.clases.length === 0;

  const lunesSel = lunesDe(diaSel);
  const diasSemana = diasDeSemana(lunesSel);
  const restoSemana = diasSemana.filter((d) => d !== diaSel && ((sesionesPorDia.get(d) ?? []).length > 0 || (clasesDelDia.get(d) ?? []).length > 0));
  const rangoSemana = `${Number(diasSemana[0].slice(8))} – ${Number(diasSemana[6].slice(8))} ${etiquetaMes(mesDe(diasSemana[6])).split(' ')[0]}`;

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-4 animate-in fade-in duration-150">
      <Interruptor
        etiqueta="Vista del calendario"
        valor={vista}
        onChange={setVista}
        opciones={[{ valor: 'semana', etiqueta: 'Semana' }, { valor: 'mes', etiqueta: 'Mes' }]}
      />

      {/* LA SEMANA: la que toca ahora, con el día elegido y lo que viene. */}
      {vista === 'semana' && (
        <Card pad="sm">
          <div className="flex items-center gap-1 mb-2">
            <button onClick={() => cambiaSemana(-1)} aria-label="Semana anterior" className="w-11 h-11 flex items-center justify-center rounded-sm border border-slate-200 dark:border-slate-700 text-marino dark:text-white">
              <ChevronLeft size={18} />
            </button>
            <div className="flex-1 text-center">
              <h2 className="font-titulo font-bold uppercase text-xl sm:text-2xl text-marino dark:text-white tracking-wide">{rangoSemana}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{lunesSel === lunesDe(hoy) ? 'Semana en curso' : 'Otra semana'}</p>
            </div>
            <button onClick={() => cambiaSemana(1)} aria-label="Semana siguiente" className="w-11 h-11 flex items-center justify-center rounded-sm border border-slate-200 dark:border-slate-700 text-marino dark:text-white">
              <ChevronRight size={18} />
            </button>
            <button onClick={irAHoy} className="min-h-[44px] px-3 text-xs font-black text-marino dark:text-oro-claro">Hoy</button>
          </div>
          {!datos && !error && <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>}
          {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400 py-4 text-center">{error}</p>}
          {datos && datos.notas.find((n) => n.weekStart === lunesSel) && (
            <p className="mb-2 px-2 py-1 rounded-sm bg-oro/15 text-[11px] font-semibold text-oro-oscuro dark:text-oro-claro flex items-center gap-1.5 min-w-0">
              <StickyNote size={12} className="shrink-0" /> <span className="truncate">{datos.notas.find((n) => n.weekStart === lunesSel)?.note}</span>
            </p>
          )}
          {datos && (
            <div className="grid grid-cols-7 gap-1">
              {diasSemana.map((d, i) => {
                const ses = sesionesPorDia.get(d) ?? [];
                const cls = (clasesDelDia.get(d) ?? []).filter((c) => !c.sinClase);
                const sel = d === diaSel;
                return (
                  <button
                    key={d}
                    onClick={() => setDiaSel(d)}
                    aria-pressed={sel}
                    aria-label={`${fechaLarga(d)}: ${cls.length ? `${cls.length} ${cls.length === 1 ? 'clase' : 'clases'}, ` : ''}${ses.length} ${ses.length === 1 ? 'entreno' : 'entrenos'}`}
                    className={cx(
                      'min-h-[64px] py-1.5 flex flex-col items-center justify-between rounded-sm border transition-colors min-w-0',
                      sel ? 'bg-marino text-white border-marino' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200',
                    )}
                  >
                    <span className={cx('text-[10px] font-bold tracking-widest', sel ? 'text-oro-claro' : 'text-slate-500 dark:text-slate-400')}>{DIAS[i]}</span>
                    <span className={cx('font-titulo font-bold text-xl leading-none', d === hoy && !sel && 'text-oro-oscuro dark:text-oro-claro')}>{Number(d.slice(8))}</span>
                    <span className="flex gap-0.5 h-2 items-center" aria-hidden="true">
                      {cls.slice(0, 2).map((c) => <span key={c.classId} className="w-2 h-2 rounded-sm ring-1 ring-white/70" style={{ background: colorDeGrupo(c.grupo).fondo }} />)}
                      {ses.slice(0, 3).map((s) => <span key={s.id} className={cx('w-1.5 h-1.5 rounded-full', ESTILO_TIPO[s.kind].barra)} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {datos && datos.clases.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400" aria-hidden="true">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-marino" /> Clase de grupo</span>
              <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Tu entreno</span>
            </p>
          )}
        </Card>
      )}

      {vista === 'mes' && (
      <Card pad="sm">
        {/* El mes y cómo moverse por él. */}
        <div className="flex items-center gap-1 mb-2">
          <button onClick={() => cambiaMes(-1)} aria-label="Mes anterior" className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft size={18} />
          </button>
          <h2 className="flex-1 text-center font-titulo font-bold uppercase text-xl sm:text-2xl text-marino dark:text-white tracking-wide">{etiquetaMes(mes)}</h2>
          <button onClick={() => cambiaMes(1)} aria-label="Mes siguiente" className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronRight size={18} />
          </button>
          <button onClick={irAHoy} className="min-h-[44px] px-3 rounded-xl text-xs font-black text-marino dark:text-oro-claro hover:bg-oro/10">
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
              const deLaSemana = dias.flatMap((d) => contablesPorDia.get(d) ?? []);
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
                      const cls = clasesDelDia.get(d) ?? [];
                      const sel = d === diaSel;
                      return (
                        <button
                          key={d}
                          onClick={() => setDiaSel(d)}
                          aria-pressed={sel}
                          aria-label={`${fechaLarga(d)}: ${cls.length ? `${cls.length} ${cls.length === 1 ? 'clase' : 'clases'}, ` : ''}${ses.length} ${ses.length === 1 ? 'entreno' : 'entrenos'}`}
                          className={cx(
                            'min-h-[64px] rounded-xl p-0.5 flex flex-col items-stretch gap-0.5 border transition-colors min-w-0',
                            sel ? 'border-marino dark:border-oro-claro bg-oro/10' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50',
                            fuera && 'opacity-40',
                          )}
                        >
                          <span className={cx(
                            'self-center text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-full tabular-nums',
                            d === hoy ? 'bg-marino text-oro-claro' : 'text-slate-600 dark:text-slate-300',
                          )}>
                            {Number(d.slice(8))}
                          </span>
                          {cls.slice(0, 1).map((c) => (
                            <span key={c.classId}
                              className={cx('rounded-md px-0.5 py-0.5 text-[9px] font-black leading-tight truncate text-white text-center', c.sinClase && 'line-through opacity-50')}
                              style={{ background: colorDeGrupo(c.grupo).fondo }}>
                              {c.hora ?? c.grupo}
                            </span>
                          ))}
                          {ses.slice(0, cls.length ? 2 : 3).map((s) => {
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
                          {ses.length + Math.min(cls.length, 1) > 3 && <span className="text-[9px] font-bold text-slate-500 text-center">+{ses.length + Math.min(cls.length, 1) - 3}</span>}
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
      )}

      {/* El día elegido. */}
      {datos && (
        <section>
          <Kicker className="mb-2 first-letter:uppercase">{d0(diaSel, hoy)}</Kicker>
          {errorClase && <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">{errorClase}</p>}
          {nadaEnElMes ? (
            <EmptyState
              icon={<CalendarDays size={28} />}
              title="Aún no hay nada este mes"
              hint="Tus clases de grupo y tus entrenos los pone tu academia. En cuanto los suba, aparecerán aquí."
            />
          ) : delDia.length === 0 && clasesSel.length === 0 ? (
            <p className={cx(TEXT.muted, 'px-1')}>No hay nada este día.</p>
          ) : (
            <div className="space-y-2">
              {clasesSel.length > 0 && <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 flex items-center gap-1.5 px-1')}><Users size={12} /> {clasesSel.length === 1 ? 'Clase' : 'Clases'}</p>}
              {clasesSel.map(tarjetaClase)}
              {delDia.length > 0 && clasesSel.length > 0 && <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 px-1 pt-1')}>{delDia.length === 1 ? 'Tu entreno' : 'Tus entrenos'}</p>}
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

      {vista === 'semana' && datos && restoSemana.length > 0 && (
        <section>
          <Kicker className="mb-2">El resto de la semana</Kicker>
          <div className="space-y-3">
            {restoSemana.map((d) => (
              <div key={d}>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 first-letter:uppercase">{fechaLarga(d)}</p>
                <div className="space-y-2">
                  {(clasesDelDia.get(d) ?? []).map(tarjetaClase)}
                  {(sesionesPorDia.get(d) ?? []).map((s) => (
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
              </div>
            ))}
          </div>
        </section>
      )}

      {abierta && datos && (
        <DetalleSesion
          sesion={abierta}
          apunte={apuntePorSesion.get(abierta.id) ?? null}
          grupo={abierta.classId ? datos.nombresGrupo[abierta.classId] ?? 'Clase de grupo' : null}
          hoy={hoy}
          rm={datos.rm}
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
          <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 break-words">
            {ETIQUETA_TIPO[s.kind]}{meta && ` · ${meta}`} · {grupo ?? 'Tu entreno'}
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
