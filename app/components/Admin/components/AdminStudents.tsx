'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  PhoneCall, Loader2, AlertTriangle, ChevronDown, Layers, Target,
  BookOpen, GraduationCap, UserCheck, UserX, Clock, BadgeEuro, KeyRound,
  Mail, ShieldCheck, X, Send, Shuffle, Brain, Search, Archive, HelpCircle,
} from 'lucide-react';
import {
  getAcademyOverview, getStudentDetail,
  setMemberAccess, setMembershipRequired, activateAllCurrentStudents, setStudentGroups,
  listExemptEmails, addExemptEmail, removeExemptEmail, inviteStudent,
} from '@/actions';
import type { AcademyOverview, StudentDetail } from '@/app/actions/academy';
import { ESTADO_ALUMNO_LABEL, DIAS_ABANDONO, type EstadoAlumno, type FilaAlumno } from '@/app/lib/academy';
import { ERROR_LABELS } from '@/app/lib/stats';
import { formateaPeriodo } from '@/app/lib/payments';
import { fraseDudosas, umbralEnTexto, porcentajeEnTexto, netoEnTexto } from '@/app/lib/dudosas';
import AltaMasiva from './AltaMasiva';
import { Hoja, BloqueTitulo, Boton, TEXT, cx, PanelTitulo, Pulso, Aviso, Atras, Campo, CampoSelect, Filtros, FiltroChip, Etiqueta, Estado, Dato, Avatar, TablaDual, inicialesDeCorreo, nombreDeCorreo, type Tono } from '../../ui';

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
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'atencion' | 'pendiente' | 'impago'>('todos');
  const [herramientas, setHerramientas] = useState(false);
  // Con el paso de los meses se acumulan alumnos de años que ya no estudian
  // (suspendidos), mezclados con los activos, y la lista se vuelve
  // interminable. Un suspendido ya es una decisión tomada — no hace falta
  // llamarle (regla 35: la lista es para saber A QUIÉN LLAMAR) — así que se
  // recoge aparte por defecto, no se pierde ni se borra.
  const [verSuspendidos, setVerSuspendidos] = useState(false);

  const [exentos, setExentos] = useState<string[]>([]);
  const [nuevoExento, setNuevoExento] = useState('');
  const [correoInvitar, setCorreoInvitar] = useState('');
  const [avisoInvitar, setAvisoInvitar] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const [res, exentosRes] = await Promise.all([getAcademyOverview(), listExemptEmails()]);
    if (res.success) setDatos(res.data);
    else setError(res.error);
    if (exentosRes.success) setExentos(exentosRes.emails);
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

  async function invitar() {
    const correo = correoInvitar.trim();
    if (!correo) return;
    setBusy(true);
    setAvisoInvitar(null);
    const res = await inviteStudent(correo);
    if (!res.success) setError(res.error ?? 'No se pudo invitar.');
    else {
      setAvisoInvitar(res.invitada ? `Invitación enviada a ${correo}.` : `${correo} ya tenía cuenta: le hemos dado acceso.`);
      setCorreoInvitar('');
    }
    await recargar();
    setBusy(false);
  }

  async function abre(id: string) {
    setAbierto(id);
    window.scrollTo({ top: 0 });
    setFicha(null);
    setCargandoFicha(true);
    const detalle = await getStudentDetail(id);
    setCargandoFicha(false);
    if (detalle.success) setFicha(detalle.data);
  }

  if (cargando) {
    return (
      <div className="flex flex-col items-center gap-4 py-32 text-slate-600 opacity-80 dark:text-slate-400">
        <Loader2 className="animate-spin" size={32} />
        <p className="font-mono text-sm uppercase tracking-widest">Reuniendo la clase…</p>
      </div>
    );
  }
  if (error && !datos) return <Aviso tono="malo"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</Aviso>;
  if (!datos) return null;

  const { alumnos, porEstado, grupos, cobertura, sospechosas, confusas, membershipRequired, periodoActual, progresoSemanal } = datos;
  const sinBanco = cobertura.filter((c) => c.preguntas === 0);
  const pendientes = alumnos.filter((a) => a.acceso === 'pending').length;
  const pagadosMes = alumnos.filter((a) => a.pagadoMesActual).length;
  const conAcceso = alumnos.filter((a) => a.acceso === 'active').length;

  const hayAlgunSinGrupo = alumnos.some((a) => a.grupos.length === 0);
  const porGrupo =
    filtroGrupo === '' ? alumnos
    : filtroGrupo === SIN_GRUPO ? alumnos.filter((a) => a.grupos.length === 0)
    : alumnos.filter((a) => a.grupos.some((g) => g.id === filtroGrupo));

  const q = busqueda.trim().toLowerCase();
  const porBusqueda = q ? porGrupo.filter((a) => (a.email ?? '').toLowerCase().includes(q)) : porGrupo;

  // Los suspendidos se recogen aparte: ya es una decisión tomada, no alguien
  // a quien llamar — sin este corte, un piloto de meses acumula alumnos de
  // cursos anteriores hasta que la lista es un scroll interminable. Una
  // búsqueda activa SÍ los busca (quien busca por nombre quiere encontrarlo,
  // esté donde esté), para no esconder a alguien que se está buscando.
  const suspendidos = porBusqueda.filter((a) => a.acceso === 'suspended');
  const base = (verSuspendidos || q) ? porBusqueda : porBusqueda.filter((a) => a.acceso !== 'suspended');

  // Los filtros ya vienen contados, para que se vea cuánta gente hay detrás.
  const atencion = (a: FilaAlumno) => a.acceso !== 'suspended' && a.estado !== 'activo';
  const impago = (a: FilaAlumno) => a.acceso === 'active' && !a.exento && !a.pagadoMesActual;
  const cuentaFiltro = { todos: base.length, atencion: base.filter(atencion).length, pendiente: base.filter((a) => a.acceso === 'pending').length, impago: base.filter(impago).length };
  const alumnosVistos = base.filter((a) => filtroEstado === 'todos' || (filtroEstado === 'atencion' ? atencion(a) : filtroEstado === 'pendiente' ? a.acceso === 'pending' : impago(a)));

  // ── LA FICHA DE UN ALUMNO ──
  const fa = abierto ? alumnos.find((a) => a.id === abierto) : undefined;
  if (fa) {
    return (
      <div className="space-y-5 animate-in fade-in pb-24">
        <Atras onClick={() => { setAbierto(null); setFicha(null); }}>Alumnos</Atras>
        <FichaAlumno a={fa} grupos={grupos} periodo={periodoActual} ficha={ficha} cargandoFicha={cargandoFicha} busy={busy} onAccion={accion} />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Alumnos"
        sub={`${conAcceso} con acceso · ${pendientes} sin activar`}
        acciones={<Boton variant={herramientas ? 'secondary' : 'primary'} onClick={() => setHerramientas((x) => !x)}>{herramientas ? 'Cerrar altas y acceso' : 'Altas y acceso'}</Boton>}
      />

      {/* --- ALTAS, INVITACIONES, CONTROL DE ACCESO Y EXENTOS --- */}
      {herramientas && (
        <div className="space-y-4 rounded-lg border border-linea bg-hundido p-3 dark:border-noche-linea dark:bg-noche-hondo sm:p-4">
      {/* --- CONTROL DE ACCESO GLOBAL --- */}
      <Hoja tone={membershipRequired ? 'brand' : 'sunken'} pad="md" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <KeyRound size={18} className={cx('shrink-0', membershipRequired ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400')} />
            <div>
              <p className={cx('font-black text-sm', membershipRequired ? 'text-white' : 'text-slate-900 dark:text-white')}>
                {membershipRequired ? 'Control de acceso ENCENDIDO' : 'Control de acceso apagado'}
              </p>
              <p className={cx('text-xs leading-relaxed mt-0.5 max-w-md', membershipRequired ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400')}>
                {membershipRequired
                  ? 'Solo entran los alumnos con acceso. Un alumno nuevo se registra y espera a que le des acceso.'
                  : 'La plataforma está abierta para todos. Enciéndelo cuando quieras que solo entren los que pagan.'}
              </p>
            </div>
          </div>
          <Boton size="sm" variant={membershipRequired ? 'secondary' : 'primary'} disabled={busy}
            onClick={() => accion(() => setMembershipRequired(!membershipRequired))}>
            {membershipRequired ? 'Apagar' : 'Encender'}
          </Boton>
        </div>
        {membershipRequired && pendientes > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">Hay {pendientes} sin activar. Si son alumnos que ya tenías, dales acceso de golpe.</p>
            <Boton size="sm" variant="secondary" disabled={busy} onClick={() => accion(async () => activateAllCurrentStudents())}>Activar a todos</Boton>
          </div>
        )}
      </Hoja>

      {/* --- ALTA DE VARIOS ALUMNOS (regla 83) --- */}
      <AltaMasiva grupos={grupos} onHecho={recargar} />

      {/* --- INVITAR ALUMNO POR CORREO --- */}
      <Hoja tone="base" pad="md" className="space-y-2">
        <BloqueTitulo icon={<Send size={12} />}>Invitar a un alumno por correo</BloqueTitulo>
        <p className={cx(TEXT.muted)}>Le llega un correo con un enlace para entrar. Al invitarlo tú, entra con acceso directo — sin pasar por la solicitud.</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={correoInvitar}
            onChange={(e) => setCorreoInvitar(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="flex-1 min-w-[200px] text-base sm:text-sm rounded-lg border border-linea dark:border-slate-700 bg-white dark:bg-noche-2 px-3 py-2"
          />
          <Boton size="sm" disabled={busy || !correoInvitar.trim()} onClick={invitar} icon={<Mail size={14} />}>Invitar</Boton>
        </div>
        {avisoInvitar && <p className="text-xs text-emerald-700 dark:text-emerald-400">{avisoInvitar}</p>}
      </Hoja>

      {/* --- EXENTOS DE PAGO --- */}
      <Hoja tone="base" pad="md" className="space-y-2">
        <BloqueTitulo icon={<ShieldCheck size={12} />}>Correos exentos de pago</BloqueTitulo>
        <p className={cx(TEXT.muted)}>Un correo de esta lista entra directo, con acceso ilimitado, sin solicitud ni pago.</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={nuevoExento}
            onChange={(e) => setNuevoExento(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="flex-1 min-w-[200px] text-base sm:text-sm rounded-lg border border-linea dark:border-slate-700 bg-white dark:bg-noche-2 px-3 py-2"
          />
          <Boton size="sm" variant="secondary" disabled={busy || !nuevoExento.trim()} onClick={() => { const c = nuevoExento.trim(); setNuevoExento(''); accion(() => addExemptEmail(c)); }}>Añadir</Boton>
        </div>
        {exentos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {exentos.map((e) => (
              <span key={e} className="text-[11px] font-semibold px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                {e}
                <button onClick={() => accion(() => removeExemptEmail(e))} disabled={busy} aria-label={`Quitar ${e} de exentos`} className="hover:text-red-600">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Hoja>

        </div>
      )}

      {/* --- EL MOTOR ADAPTATIVO, DE UN VISTAZO (regla 76) ---
          Sin esto, nada en el panel decía que el sistema está aprendiendo de
          cada alumno — solo se ve si se entra pregunta a pregunta. Se oculta
          si no hay nada que contar (regla 8): una semana en cero no se
          disfraza, pero tampoco hace falta anunciarla. */}
      {progresoSemanal.dominadasEstaSemana > 0 && (
        <Hoja tone="brand" pad="md" className="flex items-center gap-3">
          <Brain size={20} className="text-indigo-200 shrink-0" />
          <p className="text-sm text-white font-medium leading-relaxed">
            Esta semana el sistema ha llevado <strong>{progresoSemanal.dominadasEstaSemana}</strong>{' '}
            {progresoSemanal.dominadasEstaSemana === 1 ? 'pregunta' : 'preguntas'} más a dominadas, entre{' '}
            <strong>{progresoSemanal.alumnosQueAvanzan}</strong> {progresoSemanal.alumnosQueAvanzan === 1 ? 'alumno' : 'alumnos'}.
          </p>
        </Hoja>
      )}

      {/* --- CIFRAS --- */}
      <Pulso
        cifras={[
          { valor: conAcceso, etiqueta: 'con acceso', tono: 'ok' },
          { valor: pendientes, etiqueta: 'sin activar', tono: pendientes ? 'aviso' : 'neutro' },
          { valor: porEstado.nunca_entro, etiqueta: 'nunca ha entrado', tono: porEstado.nunca_entro ? 'malo' : 'neutro' },
          { valor: `${pagadosMes}/${conAcceso}`, etiqueta: `pagó ${formateaPeriodo(periodoActual).split(' de ')[0]}` },
        ]}
      />

      {/* --- BUSCADOR Y FILTRO POR GRUPO --- */}
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[14rem] flex-1">
          <Campo type="search" aria-label="Buscar por correo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por correo" />
        </div>
        {grupos.length > 0 && (
          <div className="w-full sm:w-64">
            <CampoSelect aria-label="Grupo" value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)}>
              <option value="">Todos los grupos ({alumnos.length})</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              {hayAlgunSinGrupo && <option value={SIN_GRUPO}>Sin grupo</option>}
            </CampoSelect>
          </div>
        )}
      </div>

      <Filtros etiqueta="Qué alumnos ver">
        <FiltroChip activo={filtroEstado === 'todos'} onClick={() => setFiltroEstado('todos')} cuenta={cuentaFiltro.todos}>Todos</FiltroChip>
        <FiltroChip activo={filtroEstado === 'atencion'} onClick={() => setFiltroEstado('atencion')} cuenta={cuentaFiltro.atencion}>Necesitan atención</FiltroChip>
        <FiltroChip activo={filtroEstado === 'pendiente'} onClick={() => setFiltroEstado('pendiente')} cuenta={cuentaFiltro.pendiente}>Sin activar</FiltroChip>
        <FiltroChip activo={filtroEstado === 'impago'} onClick={() => setFiltroEstado('impago')} cuenta={cuentaFiltro.impago}>Sin pagar</FiltroChip>
      </Filtros>

      {/* --- LA LISTA --- */}
      <p className={cx(TEXT.muted)}>{alumnosVistos.length} personas · abandono a partir de {DIAS_ABANDONO} días sin entrar · los grupos se definen en «Grupos»; aquí se asignan</p>
      <TablaDual
        clave={(a) => a.id}
        filas={alumnosVistos}
        onFila={(a) => abre(a.id)}
        vacio="Nadie aquí."
        columnas={[
          { id: 'alumno', titulo: 'Alumno', celda: (a) => (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar iniciales={inicialesDeCorreo(a.email)} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 dark:text-white">{nombreDeCorreo(a.email) || a.id}</p>
                <p className="truncate text-xs text-slate-600 dark:text-slate-400">{a.email ?? a.id}</p>
                {a.grupos.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{a.grupos.map((g) => <Dato key={g.id}>{g.name}</Dato>)}</div>}
              </div>
            </div>
          ) },
          { id: 'estado', titulo: 'Estado', celda: (a) => (
            <div>
              <Estado tono={TONO_ESTADO[a.estado]}>{ESTADO_ALUMNO_LABEL[a.estado]}</Estado>
              {a.diasSinEntrar !== null && <p className="ml-3.5 text-xs text-slate-600 dark:text-slate-400">{a.diasSinEntrar === 0 ? 'Entró hoy' : `Hace ${a.diasSinEntrar} días`}</p>}
            </div>
          ) },
          { id: 'acierto', titulo: 'Acierto', celda: (a) => a.winRate === null || a.contestadas === 0
            ? <span className="text-slate-600 dark:text-slate-400">Sin datos</span>
            : (
              <div className="flex items-center justify-end gap-2.5 sm:justify-start">
                <div className="hidden h-1.5 w-16 overflow-hidden rounded-full border border-linea bg-hundido dark:border-noche-linea dark:bg-noche-hondo sm:block"><div className="h-full bg-indigo-900 dark:bg-indigo-300" style={{ width: `${a.winRate}%` }} /></div>
                <span className="tabular-nums">{a.winRate} %</span><span className="text-xs text-slate-600 dark:text-slate-400">en {a.contestadas}</span>
              </div>
            ) },
          { id: 'pago', titulo: 'Pago', celda: (a) => a.acceso !== 'active' ? <span className="text-slate-500">—</span> : a.exento ? <Etiqueta tono="oro">Exento</Etiqueta>
            : a.pagadoMesActual ? <span className="font-semibold text-emerald-700 dark:text-emerald-300">Pagó</span>
            : <span className="font-semibold text-red-700 dark:text-red-300">Debe {formateaPeriodo(periodoActual).split(' de ')[0]}</span> },
          { id: 'acceso', titulo: 'Acceso', soloAncho: true, celda: (a) => <Etiqueta tono={TONO_ACCESO[a.acceso]}>{ACCESO_BADGE[a.acceso].label}</Etiqueta> },
          { id: 'ficha', titulo: '', acciones: true, derecha: true, celda: (a) => (
            <button type="button" onClick={(e) => { e.stopPropagation(); abre(a.id); }} aria-label={`Abrir la ficha de ${a.email ?? a.id}`} title="Ficha completa"
              className="grid h-11 w-11 place-items-center rounded-lg border border-linea bg-white text-2xl leading-none text-indigo-900 hover:border-indigo-700 dark:border-noche-linea dark:bg-noche-2 dark:text-indigo-200">+</button>
          ) },
        ]}
      />

      {/* --- LOS SUSPENDIDOS, RECOGIDOS APARTE ---
          Ya es una decisión tomada: no aparecen en "a quién llamar" (regla
          35), y sin este corte se acumulan curso tras curso hasta que la
          lista de arriba es un scroll interminable. No se pierden — un toque
          los trae de vuelta. */}
      {!q && suspendidos.length > 0 && (
        <Boton variant="secondary" block icon={<Archive size={13} />} onClick={() => setVerSuspendidos((v) => !v)}>
          {verSuspendidos ? 'Ocultar' : 'Ver'} {suspendidos.length} {suspendidos.length === 1 ? 'suspendido' : 'suspendidos'}
        </Boton>
      )}

      {/* --- SALUD DEL CONTENIDO (de Academia) --- */}
      <Hoja pad="md" className="space-y-3">
        <BloqueTitulo icon={<BookOpen size={12} />}>El temario</BloqueTitulo>
        <p className={cx(TEXT.muted, 'mb-2')}>
          <span className="font-black text-amber-700 dark:text-amber-400">{sinBanco.length}</span>{' '}
          {sinBanco.length === 1 ? 'tema sin ninguna pregunta' : 'temas sin ninguna pregunta'}: no se pueden estudiar aunque el alumno quiera.
        </p>
        <div className="max-h-40 overflow-y-auto text-xs text-slate-500 dark:text-slate-400 space-y-1">
          {sinBanco.slice(0, 20).map((c) => <p key={c.subjectId} className="leading-snug">· {c.title}</p>)}
          {sinBanco.length > 20 && <p>…y {sinBanco.length - 20} más</p>}
        </div>
      </Hoja>

      <Hoja pad="md" className="space-y-3">
        <BloqueTitulo icon={<AlertTriangle size={12} />}>Preguntas que falla casi todo el mundo</BloqueTitulo>
        <p className={cx(TEXT.muted, 'mb-3 leading-relaxed')}>
          No son «las difíciles»: con suficientes intentos, una pregunta que casi nadie acierta suele estar mal redactada.
        </p>
        {sospechosas.length === 0 && <p className={TEXT.muted}>Ninguna, de momento.</p>}
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {sospechosas.map((p) => (
            <div key={p.questionId} className="border border-linea dark:border-noche-linea rounded-lg p-3">
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
      </Hoja>

      {/* Descubierto de los datos (regla 73): NO dice por qué se confunden,
          solo que los alumnos que fallan una fallan la otra más de lo que el
          azar explicaría — suele ser la misma distinción mal explicada, o
          dos preguntas casi duplicadas. Nadie las ha etiquetado. */}
      <Hoja pad="md" className="space-y-3">
        <BloqueTitulo icon={<Shuffle size={12} />}>Preguntas que se confunden entre sí</BloqueTitulo>
        <p className={cx(TEXT.muted, 'mb-3 leading-relaxed')}>
          Los alumnos que fallan una fallan la otra más de lo esperado por azar. No dice por qué —
          revísalas: suele ser la misma idea mal explicada, o dos preguntas casi duplicadas.
        </p>
        {confusas.length === 0 && <p className={TEXT.muted}>Ninguna, de momento (hace falta volumen de respuestas para que signifique algo).</p>}
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {confusas.map((p) => (
            <div key={`${p.a}-${p.b}`} className="border border-linea dark:border-noche-linea rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-x-2 mb-2">
                <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-400">×{p.lift} lo esperado</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{p.fallanAmbas}/{p.n} las fallan las dos</span>
                {p.topic && <span className="text-[10px] text-slate-500 dark:text-slate-400">· {p.topic}</span>}
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug mb-1.5">
                {p.textoA ?? <span className="italic text-slate-500 dark:text-slate-400">Ya no está en el banco</span>}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">
                {p.textoB ?? <span className="italic text-slate-500 dark:text-slate-400">Ya no está en el banco</span>}
              </p>
            </div>
          ))}
        </div>
      </Hoja>
    </div>
  );
}

const TONO_ESTADO: Record<EstadoAlumno, Tono> = { activo: 'ok', en_riesgo: 'aviso', abandonado: 'malo', nunca_entro: 'apagado' };
const TONO_ACCESO: Record<FilaAlumno['acceso'], Tono> = { active: 'ok', pending: 'aviso', suspended: 'apagado' };

/**
 * LA FICHA DE UN ALUMNO: lo que antes se desplegaba dentro de la fila. Acceso,
 * grupos (casillas en el alumno, regla 53), el aviso del pago del mes y en qué
 * falla. Va a pantalla completa, con su flecha para volver a la lista.
 */
function FichaAlumno({
  a, grupos, periodo, ficha, cargandoFicha, busy, onAccion,
}: {
  a: FilaAlumno;
  grupos: { id: string; name: string; kind: string }[];
  periodo: string;
  ficha: StudentDetail | null;
  cargandoFicha: boolean;
  busy: boolean;
  onAccion: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;
}) {
  const [gruposSel, setGruposSel] = useState<Set<string>>(new Set(a.grupos.map((g) => g.id)));
  useEffect(() => { setGruposSel(new Set(a.grupos.map((g) => g.id))); }, [a.grupos]);
  const gruposSucios = gruposSel.size !== a.grupos.length || a.grupos.some((g) => !gruposSel.has(g.id));

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar size="lg" iniciales={inicialesDeCorreo(a.email)} />
        <div className="min-w-0 flex-1">
          <h2 className="font-titulo text-3xl font-bold uppercase leading-none tracking-wide">{nombreDeCorreo(a.email) || a.id}</h2>
          <p className="mt-1 break-all text-sm text-slate-600 dark:text-slate-400">{a.email ?? a.id}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Estado tono={TONO_ESTADO[a.estado]}>{ESTADO_ALUMNO_LABEL[a.estado]}</Estado>
            <Etiqueta tono={TONO_ACCESO[a.acceso]}>{ACCESO_BADGE[a.acceso].label}</Etiqueta>
            {a.exento && <Etiqueta tono="oro">Exento de pago</Etiqueta>}
            {a.grupos.map((g) => <Dato key={g.id}>{g.name}</Dato>)}
            {(a.estado === 'abandonado' || a.estado === 'nunca_entro') && <Etiqueta tono="malo">Llamar</Etiqueta>}
          </div>
        </div>
        {/* ACCESO — «Aceptar»/«Rechazar» cuando hay una solicitud de verdad esperando (P12); el mismo botón sirve luego para reactivar o suspender. */}
        <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
          {a.acceso !== 'active' && (
            <Boton disabled={busy} onClick={() => onAccion(() => setMemberAccess(a.id, 'active'))}>
              {a.acceso === 'pending' ? 'Aceptar solicitud' : 'Dar acceso'}
            </Boton>
          )}
          {a.acceso !== 'suspended' && (
            <Boton variant="danger" disabled={busy} onClick={() => onAccion(() => setMemberAccess(a.id, 'suspended'))}>
              {a.acceso === 'pending' ? 'Rechazar solicitud' : 'Suspender'}
            </Boton>
          )}
        </div>
      </div>

      <Pulso
        cifras={[
          { valor: a.contestadas === 0 ? null : `${a.winRate ?? '—'} %`, etiqueta: 'acierto' },
          { valor: a.contestadas, etiqueta: 'respondidas' },
          { valor: a.diasSinEntrar === null ? 'Nunca' : a.diasSinEntrar === 0 ? 'Hoy' : `Hace ${a.diasSinEntrar} d`, etiqueta: 'última conexión' },
          { valor: a.acceso !== 'active' ? null : a.exento ? 'Exento' : a.pagadoMesActual ? 'Al día' : 'Debe', etiqueta: `pago de ${formateaPeriodo(periodo).split(' de ')[0]}`, tono: a.acceso === 'active' && !a.exento && !a.pagadoMesActual ? 'malo' : 'neutro' },
        ]}
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* GRUPOS — casillas en el alumno */}
        <Hoja pad="md" className="space-y-3">
          <BloqueTitulo icon={<GraduationCap size={15} />}>Grupos</BloqueTitulo>
          {grupos.length === 0 ? (
            <p className={TEXT.muted}>Aún no hay grupos. Créalos en la pestaña «Grupos».</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Grupos del alumno">
                {grupos.map((g) => {
                  const on = gruposSel.has(g.id);
                  return (
                    <button key={g.id} type="button" aria-pressed={on}
                      onClick={() => { const s = new Set(gruposSel); if (on) s.delete(g.id); else s.add(g.id); setGruposSel(s); }}
                      className={cx('min-h-[44px] rounded-lg border px-3.5 text-[13px] font-medium', on ? 'border-indigo-900 bg-indigo-900 text-white dark:border-indigo-300 dark:bg-indigo-300 dark:text-marino-hondo' : 'border-linea bg-white dark:border-noche-linea dark:bg-noche-2')}>
                      {g.name}
                    </button>
                  );
                })}
              </div>
              {gruposSucios && <Boton disabled={busy} onClick={() => onAccion(() => setStudentGroups(a.id, [...gruposSel]))}>Guardar grupos</Boton>}
            </>
          )}
        </Hoja>

        {/* PAGO DEL MES — solo aviso. Se marca en «Pagos». Un exento no debe nada. */}
        {a.acceso === 'active' && (
          <Hoja pad="md" className="space-y-2">
            <BloqueTitulo icon={<BadgeEuro size={15} />}>Pago</BloqueTitulo>
            <p className={TEXT.muted}>
              {a.exento
                ? <>Exento de pago.</>
                : a.pagadoMesActual
                  ? <>Pagó {formateaPeriodo(periodo)}.</>
                  : <>Sin pagar {formateaPeriodo(periodo)}. Se marca en la pestaña «Pagos».</>}
            </p>
          </Hoja>
        )}
      </div>

      {/* FICHA: en qué falla */}
      {cargandoFicha && <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"><Loader2 size={12} className="animate-spin" /> Abriendo la ficha…</p>}
      {!cargandoFicha && ficha && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Hoja pad="md" className="min-w-0 space-y-3">
            <BloqueTitulo icon={<Layers size={15} />}>Temas, del peor al mejor</BloqueTitulo>
            {ficha.temas.length === 0 && <p className={TEXT.muted}>Todavía no ha contestado ninguna pregunta.</p>}
            <div className="space-y-2.5">
              {ficha.temas.slice(0, 8).map((t) => (
                <div key={t.topic} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{t.topic}</p>
                    <div className="mt-1 h-2 overflow-hidden rounded-full border border-linea bg-hundido dark:border-noche-linea dark:bg-noche-hondo">
                      <div className="h-full bg-indigo-900 dark:bg-indigo-300" style={{ width: `${t.winRate}%` }} />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">{t.winRate} %</span>
                </div>
              ))}
            </div>
          </Hoja>
          <Hoja pad="md" className="min-w-0 space-y-3">
            <BloqueTitulo icon={<Target size={15} />}>Cómo se equivoca</BloqueTitulo>
            {ficha.errores.porTipo.length === 0 && ficha.errores.sinClasificar === 0 && <p className={TEXT.muted}>Sin fallos registrados.</p>}
            <div className="space-y-1.5">
              {ficha.errores.porTipo.map((e) => (
                <div key={e.tipo} className="flex justify-between text-[13px]">
                  <span>{ERROR_LABELS[e.tipo] ?? e.tipo}</span>
                  <span className="font-semibold tabular-nums">{e.veces}</span>
                </div>
              ))}
              {ficha.errores.sinClasificar > 0 && (
                <div className="flex justify-between border-t border-linea pt-1.5 text-[13px] dark:border-noche-linea">
                  <span className="italic text-slate-600 dark:text-slate-400">Sin diagnosticar</span>
                  <span className="font-semibold tabular-nums">{ficha.errores.sinClasificar}</span>
                </div>
              )}
            </div>
          </Hoja>

          {/* LAS DUDOSAS (regla 80). Lo que pidió la academia: cuánto
              acierta este alumno en lo que contesta dudando, y si con la
              penalización le compensa contestarlas. */}
          <Hoja pad="md" className="min-w-0 space-y-3 lg:col-span-2">
            <BloqueTitulo icon={<HelpCircle size={15} />}>Cuando duda</BloqueTitulo>
            {ficha.dudosas.marcadas === 0 ? (
              <p className={TEXT.muted}>Todavía no ha marcado ninguna pregunta como dudosa.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                  <span><b className="tabular-nums">{ficha.dudosas.marcadas}</b> dudosas</span>
                  <span>acierto <b className="tabular-nums">{porcentajeEnTexto(ficha.dudosas.acierto)}</b> ({ficha.dudosas.aciertos} de {ficha.dudosas.contestadas})</span>
                  {ficha.dudosas.enBlanco > 0 && <span><b className="tabular-nums">{ficha.dudosas.enBlanco}</b> en blanco</span>}
                  <span>sin dudar <b className="tabular-nums">{porcentajeEnTexto(ficha.dudosas.noDudosas.acierto)}</b></span>
                  <span>netos <b className="tabular-nums">{netoEnTexto(ficha.dudosas.netoAciertos)}</b></span>
                </div>
                <p className={cx('text-[13px]', ficha.dudosas.compensa === false ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400')}>
                  {fraseDudosas(ficha.dudosas, 'profesor')} Umbral con la penalización: {umbralEnTexto(ficha.dudosas.umbral)}.
                </p>
              </div>
            )}
          </Hoja>
        </div>
      )}
    </>
  );
}
