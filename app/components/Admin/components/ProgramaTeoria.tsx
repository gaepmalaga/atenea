'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Check, Trash2, X, Search } from 'lucide-react';
import { saveClaseTeoria, getAvanceTeoria, setSinClase } from '@/actions';
import type { AvanceTeoria } from '@/app/actions/teoria';
import { temasDeAsignaciones, avanceDeGrupo, textoTemas, normalizaTemas, MAX_TEMAS_CLASE } from '@/app/lib/teoria';
import type { EventoCalendario } from '@/app/lib/calendario';
import { Hoja, Boton, Campo, CampoSelect, Rotulo, TEXT, cx } from '../../ui';
import { confirmar } from '@/app/lib/dialogos';

/**
 * La parte de teoría de la ficha de una clase del calendario (regla 131):
 * quién la da (UNO), qué temas, una nota, y cómo lleva el temario ese grupo.
 */
export default function ProgramaTeoria({ e, profesores, onCambio }: {
  e: EventoCalendario;
  profesores: { id: string; nombre: string }[];
  /** Tras guardar: el calendario vuelve a pedir lo suyo. */
  onCambio: () => void;
}) {
  const [profesorId, setProfesorId] = useState(e.profesorIds[0] ?? '');
  // Lo normal es un profesor; hay clases con dos (regla 142). El segundo solo sale si se pide o ya lo hay.
  const [profesor2Id, setProfesor2Id] = useState(e.profesorIds[1] ?? '');
  const [conSegundo, setConSegundo] = useState(!!e.profesorIds[1]);
  const [temas, setTemas] = useState<number[]>(e.temas);
  const [busca, setBusca] = useState('');
  const [nota, setNota] = useState(e.nota ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [avance, setAvance] = useState<AvanceTeoria | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!e.grupoId) return;
      const r = await getAvanceTeoria({ classId: e.grupoId });
      if (vivo && r.success) setAvance(r.avance);
    })();
    return () => { vivo = false; };
  }, [e.grupoId, vuelta]);

  const nombres = useMemo(() => new Map(profesores.map((p) => [p.id, p.nombre])), [profesores]);
  const leidos = temas;

  async function guarda(vaciar = false) {
    if (!e.grupoId) return;
    setOcupado(true); setError(null); setGuardado(false);
    const r = await saveClaseTeoria({
      classId: e.grupoId, fecha: e.fecha,
      profesorId: vaciar ? null : profesorId || null,
      profesor2Id: vaciar || !conSegundo ? null : profesor2Id || null,
      temas: vaciar ? [] : leidos,
      nota: vaciar ? null : nota,
    });
    setOcupado(false);
    if (!r.success) { setError(r.error); return; }
    if (vaciar) { setProfesorId(''); setProfesor2Id(''); setConSegundo(false); setTemas([]); setNota(''); }
    setGuardado(true);
    setVuelta((n) => n + 1);
    onCambio();
  }

  async function sinClase(motivo: string) {
    if (!e.grupoId) return;
    setOcupado(true); setError(null);
    const r = await setSinClase({ fecha: e.fecha, classIds: [e.grupoId], sinClase: true, motivo });
    setOcupado(false);
    if (!r.success) { setError(r.error); return; }
    onCambio();
  }

  const dados = useMemo(() => (avance && e.grupoId ? temasDeAsignaciones(avance.dados) : []), [avance, e.grupoId]);
  const av = avance && e.grupoId ? avanceDeGrupo(dados, e.grupoId, avance.temario.map((t) => t.numero), avance.hoy) : null;
  function alterna(n: number) {
    setGuardado(false);
    setTemas((actual) => (actual.includes(n) ? actual.filter((x) => x !== n) : normalizaTemas([...actual, n]).slice(0, MAX_TEMAS_CLASE)));
  }
  // De cada tema, si el grupo ya lo ha dado o lo tiene programado, y cuándo y quién (sin contar ESTA clase).
  const infoTema = useMemo(() => {
    const m = new Map<number, { texto: string; futuro: boolean }>();
    if (!avance) return m;
    for (const d of dados) {
      if (d.fecha === e.fecha) continue;
      const futuro = d.fecha > avance.hoy;
      const quien = d.profesorId ? ` · ${(nombres.get(d.profesorId) ?? '').split(' ')[0]}` : '';
      m.set(d.tema, { texto: `${futuro ? 'Programado' : 'Dado'} el ${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}${quien}`, futuro });
    }
    return m;
  }, [avance, dados, nombres, e.fecha]);
  const linea = (d: { tema: number; fecha: string; profesorId: string | null }) =>
    `Tema ${d.tema} · ${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}${d.profesorId ? ` · ${(nombres.get(d.profesorId) ?? '').split(' ')[0]}` : ''}`;

  return (
    <div className="space-y-4">
      <Hoja tone="sunken" pad="md" className="space-y-3">
        <Rotulo>Programar esta clase</Rotulo>
        <CampoSelect label="Quién la da" value={profesorId} onChange={(ev) => { setProfesorId(ev.target.value); setGuardado(false); }}>
          <option value="">— Sin asignar —</option>
          {profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </CampoSelect>
        {conSegundo ? (
          <div className="space-y-1">
            <CampoSelect label="Segundo profesor (cuenta también como clase dada)" value={profesor2Id} onChange={(ev) => { setProfesor2Id(ev.target.value); setGuardado(false); }}>
              <option value="">— Ninguno —</option>
              {profesores.filter((p) => p.id !== profesorId).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </CampoSelect>
            <button type="button" className="min-h-[36px] text-xs font-semibold text-indigo-900 underline dark:text-indigo-200"
              onClick={() => { setConSegundo(false); setProfesor2Id(''); setGuardado(false); }}>Quitar el segundo profesor</button>
          </div>
        ) : profesorId ? (
          <button type="button" className="min-h-[36px] text-left text-xs font-semibold text-indigo-900 underline dark:text-indigo-200"
            onClick={() => setConSegundo(true)}>+ Añadir un segundo profesor</button>
        ) : null}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Tema (o temas)</p>
          {temas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {temas.map((n) => (
                <button key={n} type="button" onClick={() => { setTemas(temas.filter((x) => x !== n)); setGuardado(false); }}
                  aria-label={`Quitar el tema ${n}`}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-full bg-indigo-900 px-3 text-sm font-semibold text-white dark:bg-indigo-300 dark:text-marino-hondo">
                  Tema {n} <X size={14} />
                </button>
              ))}
            </div>
          ) : <p className={TEXT.muted}>Ninguno elegido. Toca los que da en esta clase.</p>}
          <Campo value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Buscar por número o título…" aria-label="Buscar un tema"
            trailing={<Search size={15} className="mr-2 text-slate-500" aria-hidden />} />
          {!avance ? (
            <div className="flex justify-center py-3"><Loader2 className="animate-spin text-slate-400" size={18} /></div>
          ) : (
            <ul className="max-h-64 divide-y divide-linea overflow-y-auto rounded-lg border border-linea bg-white dark:divide-noche-linea dark:border-noche-linea dark:bg-noche-2">
              {avance.temario.filter((t) => {
                const q = busca.trim().toLowerCase();
                return !q || String(t.numero) === q || `tema ${t.numero}`.includes(q) || t.titulo.toLowerCase().includes(q);
              }).map((t) => {
                const on = temas.includes(t.numero);
                const d = infoTema.get(t.numero);
                return (
                  <li key={t.numero}>
                    <button type="button" role="checkbox" aria-checked={on} onClick={() => alterna(t.numero)}
                      className={cx('flex min-h-[48px] w-full items-center gap-3 px-3 py-1.5 text-left', on && 'bg-indigo-50 dark:bg-indigo-900/30')}>
                      <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded border-2', on ? 'border-indigo-900 bg-indigo-900 text-white dark:border-indigo-300 dark:bg-indigo-300 dark:text-marino-hondo' : 'border-slate-400 dark:border-slate-600')}>
                        {on && <Check size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-slate-900 dark:text-white">{t.numero} · {t.titulo}</span>
                        {d && <span className={cx('block text-[11px]', d.futuro ? 'text-indigo-800 dark:text-indigo-300' : 'text-emerald-700 dark:text-emerald-400')}>{d.texto}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Campo label="Nota (opcional)" hint="Sale delante del tema en el cuadrante de la semana. Por ejemplo: «Simulacro +» u «Organigrama»." value={nota} maxLength={200} onChange={(ev) => { setNota(ev.target.value); setGuardado(false); }} />
        {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Boton disabled={ocupado} icon={ocupado ? <Loader2 size={14} className="animate-spin" /> : undefined} onClick={() => guarda()}>Guardar</Boton>
          {(e.profesorIds.length > 0 || e.temas.length > 0 || e.nota) && (
            <Boton variant="ghost" disabled={ocupado} icon={<Trash2 size={14} />}
              onClick={async () => { if (await confirmar('¿Dejar esta clase sin asignar?')) guarda(true); }}>Vaciar</Boton>
          )}
          <Boton variant="ghost" disabled={ocupado} onClick={async () => { if (await confirmar('¿Marcar esta clase como «sin clase»? Desaparece de la programación y los alumnos la ven así.')) sinClase('Sin clase'); }}>No hay clase este día</Boton>
          {guardado && <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400"><Check size={14} /> Guardado</span>}
        </div>
      </Hoja>

      {e.grupo && (
        <Hoja pad="md" className="space-y-2">
          <Rotulo>Temas de {e.grupo}</Rotulo>
          {!av ? (
            <div className="flex justify-center py-3"><Loader2 className="animate-spin text-slate-400" size={18} /></div>
          ) : (
            <>
              <p className="text-sm text-slate-800 dark:text-slate-200">
                <b>{av.dado.length}</b> de {avance!.temario.length} dados · <b>{av.programado.length}</b> programados · <b>{av.pendientes.length}</b> pendientes
              </p>
              {av.dado.length > 0 && (
                <div>
                  <p className={TEXT.muted}>Dados</p>
                  <ul className="text-[13px] text-slate-800 dark:text-slate-200">{av.dado.map((d) => <li key={d.tema}>{linea(d)}</li>)}</ul>
                </div>
              )}
              {av.programado.length > 0 && (
                <div>
                  <p className={TEXT.muted}>Programados</p>
                  <ul className="text-[13px] text-slate-800 dark:text-slate-200">{av.programado.map((d) => <li key={d.tema}>{linea(d)}</li>)}</ul>
                </div>
              )}
              {av.pendientes.length > 0 && (
                <p className={cx(TEXT.muted, 'text-[13px]')}>Pendientes: {textoTemas(av.pendientes)}</p>
              )}
            </>
          )}
        </Hoja>
      )}
    </div>
  );
}
