'use client';

import { useEffect, useState } from 'react';
import { Building2, Loader2, AlertTriangle, CalendarClock, Link2, Check, Copy } from 'lucide-react';
import {
  getAcademySettings,
  saveAcademySettings,
  getConvocatoria,
  saveConvocatoria,
  listStaff,
} from '@/actions';
import type { AcademySettings, StaffMember } from '@/app/lib/academy-settings';
import { diasHasta, textoCuentaAtras, type Convocatoria } from '@/app/lib/convocatoria';
import { Hoja, Boton, Campo, CampoArea, BloqueTitulo, TEXT, cx } from '../../ui';

/**
 * Los datos de la academia: nombre, dirección, horario, contacto, y quién da
 * clase. Salió de una pregunta directa del dueño: "algún lugar para poner el
 * nombre de la academia, dirección, horarios, emails, profesores...?".
 *
 * Requiere `docs/sql/academia-ajustes.sql` ejecutado — mientras no lo esté,
 * las lecturas fallan con un error de esquema y aquí se enseña sin romper
 * nada (mismo patrón que `admin_audit_log`).
 */
export default function AcademyIdentity() {
  const [settings, setSettings] = useState<AcademySettings | null>(null);
  const [slug, setSlug] = useState('');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tablaFalta, setTablaFalta] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([getAcademySettings(), listStaff()]).then(([s, st]) => {
      if (!vivo) return;
      if (s.success) { setSettings(s.settings); setSlug(s.slug); }
      else setError(s.error);
      if (st.success) setStaff(st.staff);
      else if (/could not find the table/i.test(st.error)) setTablaFalta(true);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  if (cargando) {
    return (
      <Hoja tone="sunken" pad="lg" className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
        <Loader2 size={16} className="animate-spin" /> Cargando…
      </Hoja>
    );
  }

  if (tablaFalta) {
    return (
      <Hoja pad="md" className="border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-start gap-3">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          Falta ejecutar{' '}
          <code className="font-mono bg-black/10 dark:bg-white/10 px-1 rounded">docs/sql/academia-ajustes.sql</code>{' '}
          en el editor SQL de Supabase. En cuanto se ejecute, esta sección deja de estar vacía.
        </p>
      </Hoja>
    );
  }

  return (
    <div className="space-y-6">
      <CardEnlace slug={slug} />
      <CardConvocatoria />
      <FichaAcademia inicial={settings} error={error} />
      <EnlaceProfesores cuantos={staff.length} />
    </div>
  );
}

/**
 * EL ENLACE DE LA ACADEMIA (`/alphapol`, `/depol`…) — P11.
 *
 * Salió de una pregunta directa: "¿dónde tienen las academias su enlace para
 * poder enviarlo a sus alumnos?". En ningún sitio: el admin de una academia
 * no tenía forma de ver su propio slug. Es lo que un alumno usa para
 * registrarse en ESTA academia (P11j) — sin él, no hay forma de repartirlo.
 *
 * `window.location.origin` y no un dominio a fuego: en local enseña
 * `localhost:3000`, en producción el dominio real, sin mantenimiento.
 */
function CardEnlace({ slug }: { slug: string }) {
  const [copiado, setCopiado] = useState(false);
  if (!slug) return null;

  const url = typeof window !== 'undefined' ? `${window.location.origin}/${slug}` : `/${slug}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Portapapeles bloqueado (permisos, contexto no seguro): el enlace
      // sigue ahí, seleccionable a mano.
    }
  }

  return (
    <Hoja pad="md" className="space-y-3">
      <BloqueTitulo icon={<Link2 size={16} />}>Tu enlace de acceso</BloqueTitulo>
      <p className={TEXT.muted}>
        Es lo que le das a un alumno para que se registre en tu academia — nunca la URL pelada.
      </p>
      <div className="flex items-center gap-2 min-w-0">
        <code className="flex-1 min-w-0 truncate rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2.5 text-sm font-mono text-slate-700 dark:text-slate-200">
          {url}
        </code>
        <Boton
          size="sm"
          variant="secondary"
          icon={copiado ? <Check size={14} /> : <Copy size={14} />}
          onClick={copiar}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </Boton>
      </div>
    </Hoja>
  );
}

/**
 * LA CONVOCATORIA — la fecha del examen. Se pone aquí una vez y el alumno la ve
 * como cuenta atrás en «Mi perfil». Degrada con gracia si falta el guion
 * `docs/sql/convocatoria.sql`.
 */
function CardConvocatoria() {
  const [conv, setConv] = useState<Convocatoria>({ escala: '', fechaExamen: '', nota: '' });
  const [cargando, setCargando] = useState(true);
  const [tablaFalta, setTablaFalta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getConvocatoria().then((res) => {
      if (!vivo) return;
      if (res.success) {
        setConv({
          escala: res.convocatoria.escala ?? '',
          fechaExamen: res.convocatoria.fechaExamen ?? '',
          nota: res.convocatoria.nota ?? '',
        });
        setTablaFalta(!!res.tablaFalta);
      } else setErr(res.error);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  async function guardar() {
    setGuardando(true); setOk(false); setErr(null);
    const res = await saveConvocatoria(conv);
    if (res.success) setOk(true);
    else {
      setErr(res.error ?? 'No se pudo guardar.');
      if ('tablaFalta' in res && res.tablaFalta) setTablaFalta(true);
    }
    setGuardando(false);
  }

  const dias = diasHasta(conv.fechaExamen || null);

  return (
    <Hoja pad="md" className="space-y-4">
      <BloqueTitulo icon={<CalendarClock size={16} />}>La convocatoria</BloqueTitulo>

      {tablaFalta && (
        <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          Falta ejecutar <code className="font-mono bg-black/10 dark:bg-white/10 px-1 rounded">docs/sql/convocatoria.sql</code>.
          Puedes rellenar los campos; se guardarán en cuanto se ejecute.
        </p>
      )}

      {cargando ? (
        <p className={cx(TEXT.muted)}>Cargando…</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Escala" value={conv.escala ?? ''} onChange={(e) => setConv({ ...conv, escala: e.target.value })} placeholder="Escala Básica" />
            <Campo label="Fecha del examen" type="date" value={conv.fechaExamen ?? ''} onChange={(e) => setConv({ ...conv, fechaExamen: e.target.value })} />
          </div>
          <Campo label="Nota (opcional)" value={conv.nota ?? ''} onChange={(e) => setConv({ ...conv, nota: e.target.value })} placeholder="BOE-A-2027-…" />

          {conv.fechaExamen && dias !== null && (
            <p className={cx(TEXT.muted)}>El alumno verá: <strong className="text-slate-700 dark:text-slate-200">{textoCuentaAtras(dias)}</strong>.</p>
          )}

          {err && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{err}</p>}
          {ok && <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Guardado.</p>}

          <div className="flex justify-end">
            <Boton onClick={guardar} disabled={guardando} icon={guardando ? <Loader2 size={14} className="animate-spin" /> : null}>
              Guardar
            </Boton>
          </div>
        </>
      )}
    </Hoja>
  );
}

function FichaAcademia({ inicial, error }: { inicial: AcademySettings | null; error: string | null }) {
  const [name, setName] = useState(inicial?.name ?? '');
  const [address, setAddress] = useState(inicial?.address ?? '');
  const [schedule, setSchedule] = useState(inicial?.schedule ?? '');
  const [contactEmail, setContactEmail] = useState(inicial?.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(inicial?.contactPhone ?? '');
  const [guardando, setGuardando] = useState(false);
  const [guardadoError, setGuardadoError] = useState<string | null>(error);
  const [guardadoOk, setGuardadoOk] = useState(false);

  async function guardar() {
    setGuardando(true);
    setGuardadoOk(false);
    setGuardadoError(null);
    const res = await saveAcademySettings({ name, address, schedule, contactEmail, contactPhone });
    if (res.success) setGuardadoOk(true);
    else setGuardadoError(res.error ?? 'No se pudo guardar.');
    setGuardando(false);
  }

  return (
    <Hoja pad="md" className="space-y-4">
      <BloqueTitulo icon={<Building2 size={16} />}>Datos de la academia</BloqueTitulo>

      <div className="grid sm:grid-cols-2 gap-4">
        <Campo label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alphapol" />
        <Campo label="Horario" value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="L-V 10:00-14:00 y 17:00-21:00" />
      </div>
      <CampoArea label="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Calle, número, ciudad" />
      <div className="grid sm:grid-cols-2 gap-4">
        <Campo label="Correo de contacto" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="info@academia.es" />
        <Campo label="Teléfono de contacto" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="600 000 000" />
      </div>

      {guardadoError && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{guardadoError}</p>}
      {guardadoOk && <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Guardado.</p>}

      <div className="flex justify-end">
        <Boton onClick={guardar} disabled={guardando} icon={guardando ? <Loader2 size={14} className="animate-spin" /> : null}>
          Guardar
        </Boton>
      </div>
    </Hoja>
  );
}

/**
 * Los profesores tienen su pestaña desde la regla 99: aquí, al fondo de
 * «Ajustes», nadie los encontraba.
 */
function EnlaceProfesores({ cuantos }: { cuantos: number }) {
  return (
    <Hoja pad="md" className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <BloqueTitulo>Profesores</BloqueTitulo>
        <p className={TEXT.muted}>{cuantos ? `${cuantos} ${cuantos === 1 ? 'profesor' : 'profesores'}. ` : ''}Se gestionan en su pestaña, con sus grupos y sus clases de física.</p>
      </div>
      <Boton size="sm" variant="secondary" onClick={() => window.dispatchEvent(new CustomEvent('admin:pestana', { detail: 'staff' }))}>
        Ir a «Profesores»
      </Boton>
    </Hoja>
  );
}
