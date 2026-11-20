'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { saveExtra, deleteExtra } from '@/actions';
import { AUDIENCIAS, ETIQUETA_AUDIENCIA, type Audiencia } from '@/app/lib/extras';
import type { EventoCalendario } from '@/app/lib/calendario';
import { Boton, Campo, CampoSelect, Aviso, PanelLateral, TEXT } from '../../ui';
import { confirmar } from '@/app/lib/dialogos';

/**
 * Crear o cambiar una formación extra (regla 142): el Curso OSINT y otras, para
 * los mismos alumnos o para gente externa. Fecha, hora opcional, título, hasta
 * dos profesores, para quién es y una nota. Sin lista de asistentes por ahora.
 */
export default function FormacionExtra({ extra, fechaInicial, profesores, onCerrar, onCambio }: {
  /** La formación que se cambia; `null` para crear una. */
  extra: EventoCalendario | null;
  fechaInicial: string;
  profesores: { id: string; nombre: string }[];
  onCerrar: () => void;
  /** Tras guardar o borrar: el calendario vuelve a pedir lo suyo. */
  onCambio: () => void;
}) {
  const [titulo, setTitulo] = useState(extra?.titulo ?? '');
  const [fecha, setFecha] = useState(extra?.fecha ?? fechaInicial);
  const [inicio, setInicio] = useState(extra?.inicio ?? '');
  const [fin, setFin] = useState(extra?.fin ?? '');
  const [prof1, setProf1] = useState(extra?.profesorIds[0] ?? '');
  const [prof2, setProf2] = useState(extra?.profesorIds[1] ?? '');
  const [audiencia, setAudiencia] = useState<Audiencia>((AUDIENCIAS as readonly string[]).includes(extra?.audiencia ?? '') ? (extra!.audiencia as Audiencia) : 'alumnos');
  const [nota, setNota] = useState(extra?.nota ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guarda() {
    setOcupado(true); setError(null);
    const r = await saveExtra({
      id: extra?.extraId ?? null, fecha, titulo, inicio: inicio || null, fin: fin || null,
      profesorIds: [prof1, prof2].filter(Boolean), audiencia, nota: nota || null,
    });
    setOcupado(false);
    if (!r.success) { setError(r.error); return; }
    onCambio();
  }

  async function borra() {
    if (!extra?.extraId || !(await confirmar(`¿Borrar «${extra.titulo}»? No se puede deshacer.`))) return;
    setOcupado(true); setError(null);
    const r = await deleteExtra(extra.extraId);
    setOcupado(false);
    if (!r.success) { setError(r.error); return; }
    onCambio();
  }

  return (
    <PanelLateral titulo={extra ? 'Formación extra' : 'Nueva formación extra'} sub="Cursos y formaciones fuera del horario fijo de los grupos" onCerrar={onCerrar}>
      <div className="space-y-4">
        <Campo label="Título" value={titulo} maxLength={120} placeholder="Curso OSINT" onChange={(ev) => setTitulo(ev.target.value)} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Fecha" type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
          <Campo label="Hora de inicio (opcional)" type="time" value={inicio} onChange={(ev) => setInicio(ev.target.value)} />
          <Campo label="Hora de fin (opcional)" type="time" value={fin} onChange={(ev) => setFin(ev.target.value)} disabled={!inicio} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoSelect label="Quién la da" value={prof1} onChange={(ev) => setProf1(ev.target.value)}>
            <option value="">— Sin asignar —</option>
            {profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </CampoSelect>
          <CampoSelect label="Segundo profesor (opcional)" value={prof2} onChange={(ev) => setProf2(ev.target.value)} disabled={!prof1}>
            <option value="">— Ninguno —</option>
            {profesores.filter((p) => p.id !== prof1).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </CampoSelect>
        </div>
        <CampoSelect label="Para quién es" value={audiencia} onChange={(ev) => setAudiencia(ev.target.value as Audiencia)}>
          {AUDIENCIAS.map((a) => <option key={a} value={a}>{ETIQUETA_AUDIENCIA[a]}</option>)}
        </CampoSelect>
        <Campo label="Nota (opcional)" value={nota} maxLength={200} onChange={(ev) => setNota(ev.target.value)} />
        <p className={TEXT.muted}>Sale en el calendario y como franja amarilla del cuadrante semanal. De momento no se apuntan los asistentes.</p>
        {error && <Aviso tono="malo"><p>{error}</p></Aviso>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-4 dark:border-noche-linea">
          {extra?.extraId
            ? <Boton variant="danger" disabled={ocupado} onClick={borra} icon={<Trash2 size={14} />}>Borrar</Boton>
            : <span />}
          <div className="flex gap-2">
            <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
            <Boton onClick={guarda} disabled={ocupado || !titulo.trim() || !fecha} icon={ocupado ? <Loader2 size={14} className="animate-spin" /> : undefined}>Guardar</Boton>
          </div>
        </div>
      </div>
    </PanelLateral>
  );
}
