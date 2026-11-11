'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Trash2, UserRound } from 'lucide-react';
import { getMisDatos, saveMisDatos, saveMiFoto, quitaMiFoto } from '@/actions';
import { DATOS_VACIOS, FOTO_LADO, nombreVisible, type DatosAlumno } from '@/app/lib/perfil-alumno';
import { Card, SectionLabel, Button, TextField, TEXT, TAP, cx } from '../ui';

/**
 * MIS DATOS (regla 114): la foto, el nombre y el teléfono del alumno.
 *
 * La foto se recorta a un cuadrado y se reduce EN EL MÓVIL antes de subirla:
 * una foto de cámara pesa 4 MB y aquí hacen falta 30 KB. Así no se gasta ni
 * datos del alumno ni sitio en el servidor, y la subida es un instante.
 */
async function reduceFoto(fichero: File): Promise<string> {
  const url = URL.createObjectURL(fichero);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se ha podido abrir esa imagen.'));
      i.src = url;
    });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    if (!lado) throw new Error('No se ha podido abrir esa imagen.');
    const lienzo = document.createElement('canvas');
    lienzo.width = FOTO_LADO;
    lienzo.height = FOTO_LADO;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('Este navegador no puede preparar la foto.');
    // El cuadrado del centro, que es donde suele estar la cara.
    ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, FOTO_LADO, FOTO_LADO);
    return lienzo.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function MisDatos({ email }: { email?: string }) {
  const [datos, setDatos] = useState<DatosAlumno>(DATOS_VACIOS);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const selector = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    getMisDatos().then((res) => {
      if (!vivo) return;
      if (res.success) {
        setDatos(res.datos);
        setNombre(res.datos.nombre ?? '');
        setTelefono(res.datos.telefono ?? '');
      }
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  const sucio = nombre.trim() !== (datos.nombre ?? '') || telefono.trim() !== (datos.telefono ?? '');

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const res = await saveMisDatos({ nombre, telefono });
    setGuardando(false);
    if (!res.success) { setAviso({ ok: false, texto: res.error }); return; }
    setDatos(res.datos);
    setNombre(res.datos.nombre ?? '');
    setTelefono(res.datos.telefono ?? '');
    setAviso({ ok: true, texto: 'Guardado.' });
  }

  async function eligeFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichero = e.target.files?.[0];
    e.target.value = '';
    if (!fichero) return;
    setSubiendo(true);
    setAviso(null);
    try {
      const res = await saveMiFoto(await reduceFoto(fichero));
      if (!res.success) setAviso({ ok: false, texto: res.error });
      else setDatos((d) => ({ ...d, fotoUrl: res.fotoUrl }));
    } catch (err) {
      setAviso({ ok: false, texto: err instanceof Error ? err.message : 'No se ha podido preparar la foto.' });
    }
    setSubiendo(false);
  }

  async function quitar() {
    setSubiendo(true);
    setAviso(null);
    const res = await quitaMiFoto();
    if (res.success) setDatos((d) => ({ ...d, fotoUrl: null }));
    else setAviso({ ok: false, texto: res.error ?? 'No se ha podido quitar la foto.' });
    setSubiendo(false);
  }

  return (
    <Card>
      <SectionLabel icon={<UserRound size={14} />}>Mis datos</SectionLabel>

      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {datos.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={datos.fotoUrl} alt="Tu foto" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <span aria-hidden className="grid h-20 w-20 place-items-center rounded-full bg-indigo-100 text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-200">
              <UserRound size={34} />
            </span>
          )}
          {subiendo && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white">
              <Loader2 size={22} className="animate-spin" aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-900 dark:text-white">{nombreVisible(datos.nombre, email) || 'Sin nombre todavía'}</p>
          {email && <p className={cx(TEXT.muted, 'truncate')}>{email}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <input ref={selector} type="file" accept="image/*" className="hidden" onChange={eligeFoto} />
            <Button size="sm" variant="secondary" disabled={subiendo || cargando} onClick={() => selector.current?.click()} icon={<Camera size={14} />}>
              {datos.fotoUrl ? 'Cambiar foto' : 'Poner foto'}
            </Button>
            {datos.fotoUrl && (
              <button type="button" onClick={quitar} disabled={subiendo} className={cx('inline-flex items-center gap-1.5 px-2 text-xs font-bold text-slate-600 dark:text-slate-400', TAP)}>
                <Trash2 size={14} aria-hidden /> Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <TextField label="Nombre y apellidos" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={80} disabled={cargando} />
        <TextField label="Teléfono" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="tel" disabled={cargando} />
        <p className={cx(TEXT.muted)}>Los ve tu academia: así sabe quién eres y puede llamarte si hace falta.</p>
        {aviso && (
          <p role={aviso.ok ? 'status' : 'alert'} className={cx('text-sm font-semibold', aviso.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
            {aviso.texto}
          </p>
        )}
        <Button size="sm" disabled={guardando || cargando || !sucio} onClick={guardar} icon={guardando ? <Loader2 size={14} className="animate-spin" /> : undefined}>
          Guardar mis datos
        </Button>
      </div>
    </Card>
  );
}
