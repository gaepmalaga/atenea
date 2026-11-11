'use client';

import { useState } from 'react';
import { Phone, Pencil } from 'lucide-react';
import { setDatosAlumno } from '@/actions';
import { telefonoLegible, type DatosAlumno } from '@/app/lib/perfil-alumno';
import { Campo, Boton, Aviso } from '../../ui';

/**
 * EL NOMBRE Y EL TELÉFONO DE UN ALUMNO, EN SU FICHA (regla 114).
 *
 * El teléfono es un enlace `tel:`: a quien lleva dos semanas sin entrar se le
 * llama con un toque desde el móvil. La academia puede corregir los dos datos;
 * la foto la pone el alumno.
 */
export default function DatosContacto({
  alumnoId, datos, onGuardado,
}: {
  alumnoId: string;
  datos: DatosAlumno | undefined;
  onGuardado: (d: DatosAlumno) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(datos?.nombre ?? '');
  const [telefono, setTelefono] = useState(datos?.telefono ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir() {
    setNombre(datos?.nombre ?? '');
    setTelefono(datos?.telefono ?? '');
    setError(null);
    setEditando(true);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const res = await setDatosAlumno({ alumnoId, nombre, telefono });
    setGuardando(false);
    if (!res.success) { setError(res.error); return; }
    onGuardado(res.datos);
    setEditando(false);
  }

  if (!editando) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {datos?.telefono ? (
          <a href={`tel:${datos.telefono}`} className="inline-flex min-h-[44px] items-center gap-2 rounded-[7px] border border-linea px-3 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 dark:border-noche-linea dark:text-indigo-200 dark:hover:bg-indigo-500/10">
            <Phone size={15} aria-hidden /> {telefonoLegible(datos.telefono)}
          </a>
        ) : (
          <span className="text-sm text-slate-600 dark:text-slate-400">Sin teléfono</span>
        )}
        <Boton variant="secondary" onClick={abrir} icon={<Pencil size={14} />}>
          {datos?.nombre || datos?.telefono ? 'Cambiar nombre o teléfono' : 'Poner nombre y teléfono'}
        </Boton>
      </div>
    );
  }

  return (
    <div className="mt-3 max-w-md space-y-3">
      <Campo label="Nombre y apellidos" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" maxLength={80} />
      <Campo label="Teléfono" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="off" hint="Vacío lo deja sin teléfono." />
      {error && <Aviso tono="malo">{error}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Boton onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        <Boton variant="secondary" onClick={() => setEditando(false)} disabled={guardando}>Cancelar</Boton>
      </div>
    </div>
  );
}
