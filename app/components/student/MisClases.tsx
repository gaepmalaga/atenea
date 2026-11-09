'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarCheck, Loader2 } from 'lucide-react';
import { getMisClases, setMiFalta } from '@/actions';
import type { ClaseAlumno } from '@/app/actions/asistencia';
import { Card, SectionLabel, TEXT, cx } from '../ui';

/**
 * MIS CLASES (regla 82): las próximas sesiones de los grupos del alumno, y un
 * botón por sesión para avisar de que no va.
 *
 * Por defecto VA: no se le pide confirmar cada clase, solo avisar cuando
 * falta (regla 56: no se pregunta lo que se da por hecho). El aviso se puede
 * retirar hasta que empiece la clase; después la sesión se queda a la vista,
 * sin botón. La pantalla cambia al momento y, si el servidor lo rechaza, lo
 * deshace y lo dice.
 *
 * Las clases de FÍSICA no están aquí cuando la academia lleva la física en la
 * app: se ven y se avisan en el calendario de «Preparación física» (regla 97),
 * y aquí solo se dice dónde están, para que no haya dos sitios con lo mismo.
 *
 * No se pinta si el alumno no tiene ningún grupo con horario: un recuadro
 * vacío en «Mi perfil» no le dice nada.
 */
export default function MisClases() {
  const [clases, setClases] = useState<ClaseAlumno[] | null>(null);
  const [fisicaAparte, setFisicaAparte] = useState(false);
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Cada aviso sube la versión. Una carga que salió ANTES de un aviso y llega
   * DESPUÉS traería el estado viejo y lo pisaría: el botón volvía a «Aviso: no
   * voy» con la falta ya guardada (visto con la base de datos real: en
   * desarrollo la carga inicial se lanza dos veces y la segunda llegaba tarde).
   */
  const versionRef = useRef(0);

  const cargar = useCallback(async () => {
    const version = versionRef.current;
    const res = await getMisClases();
    if (version !== versionRef.current) return;
    setClases(res.success ? res.clases : []);
    setFisicaAparte(res.success && res.fisicaAparte);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function alternar(classId: string, fecha: string, falta: boolean) {
    const clave = `${classId}|${fecha}`;
    versionRef.current += 1;
    setEnVuelo(clave);
    setError(null);
    const marca = (valor: boolean) => setClases((prev) => prev?.map((c) => c.classId !== classId ? c : {
      ...c, sesiones: c.sesiones.map((s) => (s.fecha === fecha ? { ...s, falta: valor } : s)),
    }) ?? null);
    marca(falta);
    const res = await setMiFalta({ classId, fecha, falta });
    // Lo que manda es lo que ha dicho el servidor, se haya movido lo que se
    // haya movido la pantalla mientras tanto.
    if (res.success) marca(falta);
    else {
      marca(!falta);
      setError(res.error ?? 'No se ha podido guardar.');
    }
    setEnVuelo(null);
  }

  if (!clases || (clases.length === 0 && !fisicaAparte)) return null;
  const notaFisica = fisicaAparte && (
    <p className={cx(TEXT.muted, clases.length ? 'mt-3' : '')}>
      Tus clases de física, y el aviso de que faltas, están en tu calendario de <b>Preparación física</b>.
    </p>
  );

  if (clases.length === 0) {
    return (
      <Card>
        <SectionLabel icon={<CalendarCheck size={14} />}>Mis clases</SectionLabel>
        {notaFisica}
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel icon={<CalendarCheck size={14} />}>Mis clases</SectionLabel>
      <p className={cx(TEXT.muted, 'mb-3')}>
        Si vas a faltar, avísalo aquí: así tu academia sabe que esa plaza queda libre. Puedes cambiarlo hasta que empiece la clase.
      </p>
      {error && <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">{error}</p>}
      <div className="space-y-4">
        {clases.map((c) => (
          <div key={c.classId}>
            <p className="text-xs font-black text-slate-900 dark:text-white">{c.nombre}</p>
            {c.horario && <p className={cx(TEXT.muted, 'mb-1.5')}>{c.horario}</p>}
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {c.sesiones.map((s) => {
                const clave = `${c.classId}|${s.fecha}`;
                return (
                  <li key={s.fecha} className="flex items-center justify-between gap-3 py-1.5">
                    <span className={cx('text-sm', s.falta || s.sinClase ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200')}>
                      <span className="capitalize">{s.etiqueta}</span>
                      {s.hora && <span className="font-mono text-slate-500 dark:text-slate-400"> · {s.hora}</span>}
                    </span>
                    {s.editable ? (
                      <button
                        onClick={() => alternar(c.classId, s.fecha, !s.falta)}
                        disabled={enVuelo === clave}
                        aria-pressed={s.falta}
                        className={cx(
                          'min-h-[44px] min-w-[7.5rem] px-3 rounded-xl text-xs font-black border-2 transition-colors flex items-center justify-center gap-1.5',
                          s.falta
                            ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-400',
                        )}
                      >
                        {enVuelo === clave && <Loader2 size={12} className="animate-spin" />}
                        {s.falta ? 'No voy · deshacer' : 'Aviso: no voy'}
                      </button>
                    ) : (
                      <span className={cx('text-xs font-bold', s.falta ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')}>
                        {s.sinClase ? 'Sin clase' : s.falta ? 'Avisaste que no ibas' : 'En curso'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {notaFisica}
    </Card>
  );
}
