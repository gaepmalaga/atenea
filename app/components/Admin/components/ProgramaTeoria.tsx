'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Check, Trash2 } from 'lucide-react';
import { saveClaseTeoria, getAvanceTeoria } from '@/actions';
import type { AvanceTeoria } from '@/app/actions/teoria';
import { leeTemas, temasDeAsignaciones, avanceDeGrupo, textoTemas } from '@/app/lib/teoria';
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
  const [temas, setTemas] = useState(e.temas.join(', '));
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
  const leidos = leeTemas(temas);

  async function guarda(vaciar = false) {
    if (!e.grupoId) return;
    setOcupado(true); setError(null); setGuardado(false);
    const r = await saveClaseTeoria({
      classId: e.grupoId, fecha: e.fecha,
      profesorId: vaciar ? null : profesorId || null,
      temas: vaciar ? [] : leidos,
      nota: vaciar ? null : nota,
    });
    setOcupado(false);
    if (!r.success) { setError(r.error); return; }
    if (vaciar) { setProfesorId(''); setTemas(''); setNota(''); }
    setGuardado(true);
    setVuelta((n) => n + 1);
    onCambio();
  }

  const dados = useMemo(() => (avance && e.grupoId ? temasDeAsignaciones(avance.dados) : []), [avance, e.grupoId]);
  const av = avance && e.grupoId ? avanceDeGrupo(dados, e.grupoId, avance.temario.map((t) => t.numero), avance.hoy) : null;
  const titulo = (n: number) => avance?.temario.find((t) => t.numero === n)?.titulo;
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
        <Campo label="Tema (o temas)" value={temas} placeholder="8  ·  8, 9  ·  1-3" onChange={(ev) => { setTemas(ev.target.value); setGuardado(false); }}
          hint={leidos.length ? leidos.map((n) => titulo(n) ?? `Tema ${n}`).join(' · ') : 'Números del temario.'} />
        <Campo label="Nota (opcional)" value={nota} maxLength={200} onChange={(ev) => { setNota(ev.target.value); setGuardado(false); }} />
        {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Boton disabled={ocupado} icon={ocupado ? <Loader2 size={14} className="animate-spin" /> : undefined} onClick={() => guarda()}>Guardar</Boton>
          {(e.profesorIds.length > 0 || e.temas.length > 0 || e.nota) && (
            <Boton variant="ghost" disabled={ocupado} icon={<Trash2 size={14} />}
              onClick={async () => { if (await confirmar('¿Dejar esta clase sin asignar?')) guarda(true); }}>Vaciar</Boton>
          )}
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
