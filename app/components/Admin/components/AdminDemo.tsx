'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, FlaskConical, Loader2, Trash2 } from 'lucide-react';
import { getEstadoDemo, cargaDemoFase, ensayoDemo, borraDemoPaso, type EstadoDemoVista } from '@/actions';
import { ETIQUETA_FASE, FASES_DEMO, EMAIL_ALUMNO_DEMO, DOMINIO_DEMO, type EnsayoDemo, type FaseDemo } from '@/app/lib/demo-fases';
import { mesEnTexto } from '@/app/lib/cuotas';
import { Aviso, BloqueTitulo, Boton, Campo, Dato, Etiqueta, Hoja, TablaDual, type Columna } from '../../ui';

/**
 * DATOS DE DEMOSTRACIÓN (regla 106): la tarjeta de «Ajustes».
 *
 * Carga alumnos, grupos, cuadrante, entrenos, marcas, asistencia y cobros
 * INVENTADOS para ver la aplicación entera llena, y los borra quitando
 * EXACTAMENTE lo que creó la carga. La base de datos es la de producción y no
 * tiene copias: por eso el borrado enseña antes un ensayo y pide escribir
 * BORRAR.
 *
 * Vercel corta una función a los 60 s, así que la carga va por fases y por
 * tandas: esta pantalla las llama una tras otra y enseña el progreso. Si se
 * corta (se cierra la pestaña, falla la red), lo ya creado queda apuntado en
 * el registro: se puede seguir cargando o borrar.
 */

const NOMBRE_TABLA: Record<string, string> = {
  question_attempts: 'Respuestas a preguntas',
  physical_marks: 'Marcas de las pruebas',
  rm_marks: '1RM',
  training_sessions: 'Sesiones de física',
  training_session_logs: 'Apuntes de entreno',
  training_week_notes: 'Notas de semana',
  class_members: 'Alumnos en grupos',
  class_absences: 'Faltas avisadas',
  class_session_joins: 'Multis apuntados',
  class_days_off: 'Días sin clase',
  class_week_publications: 'Semanas publicadas',
  class_group_staff: 'Profesores de grupo',
  class_groups: 'Grupos',
  session_templates: 'Plantillas de sesión',
  staff_subjects: 'Temas de profesores',
  payment_entries: 'Cobros (recibos)',
  monthly_payments: 'Cuotas de alumno y mes',
  memberships: 'Membresías',
  academy_members: 'Pertenencia a la academia',
  profiles: 'Perfiles de las cuentas',
  profiles_physical: 'Sexo y datos físicos',
};
const nombreTabla = (t: string) => NOMBRE_TABLA[t] ?? t;
const mesLargo = (p: string) => mesEnTexto(p).split(' de ')[0];
const n = (x: number) => x.toLocaleString('es-ES');

type Trabajo = { tipo: 'carga' | 'borrado'; hechas: number; total: number; texto: string; fase?: FaseDemo };
type Ensayo = { datos: EnsayoDemo; volverACargar: boolean };

export default function AdminDemo() {
  const [vista, setVista] = useState<EstadoDemoVista | null>(null);
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [ensayo, setEnsayo] = useState<Ensayo | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [clave, setClave] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [resultado, setResultado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const ocupado = useRef(false);

  const refresca = useCallback(async () => {
    const r = await getEstadoDemo();
    if (r.success) setVista(r.data);
    else setError(r.error);
    setCargando(false);
  }, []);

  useEffect(() => {
    let vivo = true;
    getEstadoDemo().then((r) => {
      if (!vivo) return;
      if (r.success) setVista(r.data);
      else setError(r.error);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  /** Todas las fases, tanda a tanda. */
  async function carga() {
    if (!vista || ocupado.current) return;
    ocupado.current = true;
    setError(null); setClave(null); setAvisos([]); setResultado(null); setEnsayo(null);
    const total = vista.fases.reduce((s, f) => s + f.tandas, 0);
    let hechas = 0;
    try {
      for (const { fase, tandas } of vista.fases) {
        for (let t = 0; t < tandas; t++) {
          setTrabajo({ tipo: 'carga', hechas, total, fase, texto: `${ETIQUETA_FASE[fase]} · ${t + 1} de ${tandas}` });
          const r = await cargaDemoFase({ fase, tanda: t });
          if (!r.success) {
            setError(`${ETIQUETA_FASE[fase]}: ${r.error} Lo ya creado está apuntado: puedes seguir cargando o borrar.`);
            return;
          }
          if (r.claveAlumno) setClave(r.claveAlumno);
          hechas++;
        }
      }
      setResultado('Datos de demostración cargados.');
    } catch {
      setError('Se cortó la conexión a mitad de la carga. Lo ya creado está apuntado: puedes seguir cargando o borrar.');
    } finally {
      setTrabajo(null);
      ocupado.current = false;
      await refresca();
    }
  }

  async function pideEnsayo(volverACargar: boolean) {
    setError(null); setResultado(null); setConfirmacion(''); setBuscando(true);
    const r = await ensayoDemo();
    setBuscando(false);
    if (!r.success) { setError(r.error); return; }
    setEnsayo({ datos: r.data, volverACargar });
  }

  async function borra() {
    if (!ensayo || ocupado.current || confirmacion !== 'BORRAR') return;
    ocupado.current = true;
    const volver = ensayo.volverACargar;
    const total = ensayo.datos.total + ensayo.datos.cuentas;
    let quitadas = 0;
    let terminado = false;
    const avisosBorrado = new Set<string>();
    setError(null); setClave(null);
    try {
      for (let vuelta = 0; vuelta < 40 && !terminado; vuelta++) {
        setTrabajo({ tipo: 'borrado', hechas: Math.min(quitadas, total), total, texto: `Borrando… ${n(quitadas)} de ${n(total)}` });
        const r = await borraDemoPaso({ confirmacion });
        if (!r.success) { setError(r.error); break; }
        quitadas += r.borradas;
        r.avisos.forEach((a) => avisosBorrado.add(a));
        terminado = r.hecho;
      }
      if (terminado) {
        setEnsayo(null); setConfirmacion('');
        setAvisos([...avisosBorrado]);
        setResultado(`Borrado: ${n(quitadas)} filas y cuentas. El registro ha quedado vacío.`);
      } else {
        setError((previo) => previo ?? 'El borrado no termina. Vuelve a pulsar «Borrar»: sigue donde se quedó.');
      }
    } catch {
      setError('Se cortó la conexión a mitad del borrado. Vuelve a pulsar «Borrar»: sigue donde se quedó.');
    } finally {
      setTrabajo(null);
      ocupado.current = false;
      await refresca();
    }
    // «Volver a cargar para este mes»: borrado y, enseguida, carga.
    if (volver && terminado) await carga();
  }

  async function copia() {
    if (!clave) return;
    try { await navigator.clipboard.writeText(clave); setCopiada(true); setTimeout(() => setCopiada(false), 2000); } catch { /* sin portapapeles: se copia a mano */ }
  }

  const e = vista?.estado;
  const mes = vista ? mesLargo(vista.mesActual) : '';
  const mismoMes = !!e?.periodo && e.periodo === vista?.mesActual;
  const bloqueado = !!trabajo || buscando;

  const columnas: Columna<EnsayoDemo['filas'][number]>[] = [
    { id: 'tabla', titulo: 'Qué', celda: (f) => <span className="font-medium text-slate-900 dark:text-white">{nombreTabla(f.tabla)}</span> },
    { id: 'total', titulo: 'Filas', derecha: true, celda: (f) => <span className="tabular-nums">{n(f.total)}</span> },
    { id: 'colgadas', titulo: 'Colgadas', derecha: true, celda: (f) => (f.colgadas > 0 ? <Etiqueta tono="aviso">{n(f.colgadas)} {f.colgadas === 1 ? 'colgada' : 'colgadas'}</Etiqueta> : <span className="text-slate-500">—</span>) },
  ];

  return (
    <Hoja pad="md" className="space-y-4">
      <BloqueTitulo icon={<FlaskConical size={17} />}>Datos de demostración</BloqueTitulo>
      <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
        Para ver la aplicación entera llena: alumnos, grupos, horarios, cuadrante de física, entrenos, marcas, asistencia, cobros, recibos y caja, todo
        inventado y con correos de <code className="font-mono">@{DOMINIO_DEMO}</code> (no reciben correo). Solo se AÑADEN filas:
        nunca se toca lo que ya hay. El botón de borrar quita exactamente lo que creó la carga, y nada más.
      </p>

      {cargando && <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"><Loader2 size={15} className="animate-spin" /> Mirando si hay datos de demostración…</p>}

      {error && <Aviso tono="malo"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> <span>{error}</span></Aviso>}
      {resultado && <Aviso tono="info"><CheckCircle2 size={15} className="mt-0.5 shrink-0" /> <span>{resultado}</span></Aviso>}
      {avisos.map((a) => <Aviso key={a}><AlertTriangle size={15} className="mt-0.5 shrink-0" /> <span>{a}</span></Aviso>)}

      {clave && (
        <Aviso>
          <div className="min-w-0 space-y-2">
            <p>
              Contraseña de <strong>{EMAIL_ALUMNO_DEMO}</strong> (para ver la parte del alumno). Se enseña <strong>una sola vez</strong> y no se guarda en
              ningún sitio: cópiala ahora.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all rounded border border-linea dark:border-noche-linea bg-white dark:bg-noche px-2.5 py-1.5 font-mono text-sm text-slate-900 dark:text-white">{clave}</code>
              <Boton variant="secondary" size="sm" icon={copiada ? <Check size={14} /> : <Copy size={14} />} onClick={copia}>{copiada ? 'Copiada' : 'Copiar'}</Boton>
              <Boton variant="ghost" size="sm" onClick={() => setClave(null)}>Ya la he copiado</Boton>
            </div>
          </div>
        </Aviso>
      )}

      {trabajo && (
        <div className="space-y-3" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Loader2 size={15} className="animate-spin" /> {trabajo.texto}
          </div>
          <div className="h-2 overflow-hidden rounded bg-hundido dark:bg-noche-hondo" aria-hidden>
            <div className="h-full bg-indigo-900 transition-all dark:bg-indigo-300" style={{ width: `${Math.round((trabajo.hechas / Math.max(1, trabajo.total)) * 100)}%` }} />
          </div>
          {trabajo.tipo === 'carga' && (
            <ol className="grid gap-1 text-[13px] sm:grid-cols-2">
              {FASES_DEMO.map((f) => {
                const idx = FASES_DEMO.indexOf(f);
                const actual = trabajo.fase ? FASES_DEMO.indexOf(trabajo.fase) : -1;
                const estado = idx < actual ? 'hecha' : idx === actual ? 'en curso' : 'pendiente';
                return (
                  <li key={f} className="flex items-center justify-between gap-2 rounded border border-linea dark:border-noche-linea px-2.5 py-1.5">
                    <span className={estado === 'pendiente' ? 'text-slate-600 dark:text-slate-400' : 'font-semibold text-slate-900 dark:text-white'}>{ETIQUETA_FASE[f]}</span>
                    <Etiqueta tono={estado === 'hecha' ? 'ok' : estado === 'en curso' ? 'aviso' : 'neutro'}>{estado}</Etiqueta>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="text-xs text-slate-600 dark:text-slate-400">No cierres esta pestaña hasta que termine. Si se corta, lo ya creado queda apuntado.</p>
        </div>
      )}

      {/* El ensayo del borrado */}
      {ensayo && !trabajo && (
        <div className="space-y-3 rounded-lg border border-red-300 dark:border-red-500/40 p-3.5">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Esto es lo que se iría: {n(ensayo.datos.total)} filas y {n(ensayo.datos.cuentas)} cuentas.
          </p>
          <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
            {ensayo.datos.colgadas > 0
              ? `${n(ensayo.datos.colgadas)} de esas filas no las creó la carga sino la aplicación al usarla (cobros, faltas, meses que se abren…), pero cuelgan de una cuenta, un grupo o una sesión de la demo.`
              : 'Todas las filas las creó la carga: no hay nada «colgado» de la demo.'}{' '}
            Lo demás de la academia no se toca.
          </p>
          <TablaDual columnas={columnas} filas={ensayo.datos.filas} clave={(f) => f.tabla} soloLectura vacio="No hay nada que borrar." />
          {ensayo.datos.avisos.map((a) => <Aviso key={a}><AlertTriangle size={15} className="mt-0.5 shrink-0" /> <span>{a}</span></Aviso>)}
          <Campo
            label="Para confirmar, escribe BORRAR"
            value={confirmacion}
            onChange={(ev) => setConfirmacion(ev.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="BORRAR"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Boton variant="danger" icon={<Trash2 size={15} />} disabled={confirmacion !== 'BORRAR'} onClick={borra}>
              {ensayo.volverACargar ? `Borrar y volver a cargar ${mes}` : 'Borrar los datos de demostración'}
            </Boton>
            <Boton variant="secondary" onClick={() => { setEnsayo(null); setConfirmacion(''); }}>Cancelar</Boton>
          </div>
        </div>
      )}

      {/* El estado y los botones */}
      {!cargando && vista && !ensayo && !trabajo && (
        <div className="space-y-3">
          {e && e.hay ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <Dato>Carga de {e.periodo ? mesEnTexto(e.periodo) : '—'}</Dato>
              <Dato>{n(e.filas)} filas</Dato>
              <Dato>{n(e.cuentas)} cuentas</Dato>
              {e.completa ? <Etiqueta tono="ok">Completa</Etiqueta> : <Etiqueta tono="aviso">A medias ({e.hechas} de {e.tandas} pasos)</Etiqueta>}
            </div>
          ) : (
            <p className="text-sm text-slate-700 dark:text-slate-300">Ahora mismo no hay datos de demostración.</p>
          )}
          {e && e.hay && e.completa && (
            <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
              Entra con <strong>prueba.admin@alphapol.es</strong> y mira Alumnos, Grupos, Prep. física, Asistencia, Pagos y Calendario. Para la parte del
              alumno, entra con <strong>{EMAIL_ALUMNO_DEMO}</strong>.
              {!mismoMes && ` La carga es de ${mesEnTexto(e.periodo!)}; «Volver a cargar» la rehace para ${mes}.`}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {(!e || !e.hay) && <Boton onClick={carga} disabled={bloqueado} icon={<FlaskConical size={15} />}>Cargar datos de {mes}</Boton>}
            {e && e.hay && !e.completa && <Boton onClick={carga} disabled={bloqueado} icon={<FlaskConical size={15} />}>Seguir cargando</Boton>}
            {e && e.hay && (
              <>
                <Boton variant="secondary" onClick={() => pideEnsayo(true)} disabled={bloqueado}>Volver a cargar para este mes</Boton>
                <Boton variant="danger" onClick={() => pideEnsayo(false)} disabled={bloqueado} icon={buscando ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}>
                  Borrar los datos de demostración
                </Boton>
              </>
            )}
          </div>
        </div>
      )}
    </Hoja>
  );
}
