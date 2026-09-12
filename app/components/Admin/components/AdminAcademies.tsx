'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, RefreshCw, Plus, UserPlus, Users, ShieldCheck, Coins, BadgeEuro } from 'lucide-react';
import { getAcademiesOverview, createAcademy, addAcademyAdmin } from '@/actions';
import type { AcademyStats } from '@/app/lib/academies';
import { formateaUSD } from '@/app/lib/ai-cost';
import { formateaEUR } from '@/app/lib/payments';
import { Card, EmptyState, StatTile, Button, Modal, TextField, TEXT, cx } from '../../ui';

/**
 * «Academias» (P11f/P11i) — SOLO la ve el `superadmin`.
 *
 * Es la única pantalla que mira a TODAS las academias a la vez: cuántos
 * alumnos y admins tiene cada una, cuánto cuesta en IA y cuánto entra este
 * mes. Y desde aquí se dan de alta las academias nuevas — no un guion de
 * línea de comandos (P11i, decidido).
 *
 * La aritmética no está aquí: vive en `lib/academies.ts` (`resumeAcademias`),
 * que es donde se puede testear (regla 21).
 */
export default function AdminAcademies() {
  const [academias, setAcademias] = useState<AcademyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [adminDe, setAdminDe] = useState<AcademyStats | null>(null);

  const cargar = useCallback(async () => {
    const res = await getAcademiesOverview();
    if (res.success) setAcademias(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const totales = academias.reduce(
    (acc, a) => ({
      alumnos: acc.alumnos + a.alumnos,
      admins: acc.admins + a.admins.length,
      costeIA: acc.costeIA + a.costeIA,
      ingresosMes: acc.ingresosMes + a.ingresosMes,
    }),
    { alumnos: 0, admins: 0, costeIA: 0, ingresosMes: 0 },
  );

  return (
    <div className="space-y-4 animate-in fade-in pb-24">
      <Card tone="sunken" pad="md" className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-700/10 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <Building2 size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Academias</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>Todas las academias de la plataforma, de un vistazo.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); cargar(); }} className="w-11 h-11 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400" aria-label="Recargar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setNuevaAbierta(true)}>Nueva academia</Button>
        </div>
      </Card>

      {error && (
        <Card tone="base" pad="md" className="border-red-500/30 text-red-700 dark:text-red-300">
          <p className="text-xs font-medium">{error}</p>
        </Card>
      )}

      {!loading && !error && academias.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatTile label="Academias" value={academias.length} tone="neutral" />
          <StatTile label="Alumnos (todas)" value={totales.alumnos} tone="brand" />
          <StatTile label="Coste IA (todo)" value={formateaUSD(totales.costeIA)} tone="warning" />
          <StatTile label="Cobrado este mes" value={formateaEUR(totales.ingresosMes)} tone="success" />
        </div>
      )}

      {!loading && !error && academias.length === 0 && (
        <EmptyState
          icon={<Building2 size={40} />}
          title="Todavía no hay ninguna academia"
          hint="Da de alta la primera con «Nueva academia»."
          bordered
        />
      )}

      <div className="space-y-2">
        {academias.map((a) => (
          <Card key={a.id} tone="base" pad="md" className="min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h4 className="font-black text-slate-900 dark:text-white truncate">{a.name}</h4>
                <p className={cx(TEXT.muted, 'font-mono')}>/{a.slug}</p>
              </div>
              <Button size="sm" variant="ghost" icon={<UserPlus size={13} />} onClick={() => setAdminDe(a)}>
                Añadir admin
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <MiniStat icon={<Users size={13} />} label="Alumnos" value={a.alumnos} />
              <MiniStat icon={<ShieldCheck size={13} />} label="Admins" value={a.admins.length} />
              <MiniStat icon={<Coins size={13} />} label="Coste IA" value={formateaUSD(a.costeIA)} />
              <MiniStat icon={<BadgeEuro size={13} />} label="Cobrado (mes)" value={formateaEUR(a.ingresosMes)} />
            </div>
            {a.admins.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <p className={cx(TEXT.muted, 'mb-1.5')}>Quién la administra</p>
                <div className="flex flex-wrap gap-1.5">
                  {a.admins.map((admin) => (
                    <span
                      key={admin.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 font-mono text-[11px] text-slate-700 dark:text-slate-200"
                      title={admin.id}
                    >
                      <ShieldCheck size={11} className="text-slate-400 shrink-0" />
                      {admin.email ?? admin.id.slice(0, 8)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {nuevaAbierta && <NuevaAcademiaModal onClose={() => setNuevaAbierta(false)} onCreada={cargar} />}
      {adminDe && <AnadirAdminModal academia={adminDe} onClose={() => setAdminDe(null)} onHecho={cargar} />}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5">{value}</p>
    </div>
  );
}

// ============================================================
// NUEVA ACADEMIA
// ============================================================

/** «Alpha Policía» -> «alpha-policia», la MISMA normalización de `lib/academies.ts`
 *  pero solo para previsualizar mientras se escribe — el servidor la vuelve a
 *  calcular y es la única que cuenta (regla 1: nunca se confía en el cliente). */
function previsualizaSlug(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function NuevaAcademiaModal({ onClose, onCreada }: { onClose: () => void; onCreada: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [tocoSlug, setTocoSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugVisible = tocoSlug ? slug : previsualizaSlug(name);

  async function guardar() {
    setBusy(true);
    setError(null);
    const res = await createAcademy({ name, slug: tocoSlug ? slug : undefined });
    setBusy(false);
    if (!res.success) { setError(res.error); return; }
    onCreada();
    onClose();
  }

  return (
    <Modal
      title="Nueva academia"
      subtitle="Nace abierta y sin nadie dentro: añade un admin justo después."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy || !name.trim()} icon={<Plus size={14} />}>
            {busy ? 'Creando…' : 'Crear academia'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Nombre"
          placeholder="DePol Granada"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <TextField
          label="Enlace (URL)"
          placeholder={previsualizaSlug(name) || 'depol-granada'}
          value={slugVisible}
          onChange={(e) => { setTocoSlug(true); setSlug(e.target.value); }}
          hint={`Entrarán por atenea.app/${slugVisible || '…'} — se deriva del nombre, pero se puede cambiar.`}
        />
        {error && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}

// ============================================================
// AÑADIR UN ADMIN A UNA ACADEMIA
// ============================================================

function AnadirAdminModal({
  academia,
  onClose,
  onHecho,
}: {
  academia: AcademyStats;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  async function guardar() {
    setBusy(true);
    setError(null);
    const res = await addAcademyAdmin(academia.id, email);
    setBusy(false);
    if (!res.success) { setError(res.error ?? 'No se pudo añadir.'); return; }
    setHecho(true);
    onHecho();
  }

  return (
    <Modal
      title={`Añadir admin a ${academia.name}`}
      subtitle="Tiene que existir ya la cuenta — esto no la crea, solo le da el rol."
      onClose={onClose}
      footer={
        hecho ? (
          <Button onClick={onClose}>Listo</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button onClick={guardar} disabled={busy || !email.trim()} icon={<UserPlus size={14} />}>
              {busy ? 'Añadiendo…' : 'Añadir'}
            </Button>
          </>
        )
      }
    >
      {hecho ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
          Hecho: {email.trim()} ya administra {academia.name}.
        </p>
      ) : (
        <div className="space-y-4">
          <TextField
            label="Correo de la cuenta"
            type="email"
            placeholder="profesor@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          {error && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
