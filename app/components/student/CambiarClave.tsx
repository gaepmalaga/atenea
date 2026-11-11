'use client';

import { useMemo, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/app/lib/supabase/client';
import { mensajeDeAuth } from '@/app/lib/auth-messages';
import { Card, SectionLabel, Button, TextField, TEXT, cx } from '../ui';
import { MIN_CLAVE, META_CLAVE_PROVISIONAL } from '@/app/lib/clave';

/**
 * CAMBIAR LA CONTRASEÑA (regla 83).
 *
 * Hace falta desde que la academia puede dar de alta a sus alumnos con una
 * contraseña PROVISIONAL repartida en clase: el alumno tiene que poder poner
 * la suya sin pasar por «¿Olvidaste tu contraseña?», que gasta un correo del
 * límite de 30 por hora.
 *
 * Va con el cliente del navegador (`auth.updateUser`), no con una Server
 * Action: es la propia sesión del alumno cambiando su clave, y Supabase no
 * pide volver a identificarse para esto en este proyecto
 * (`security_update_password_require_reauthentication = false`).
 */
export default function CambiarClave() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [abierta, setAbierta] = useState(false);
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const problema =
    clave.length > 0 && clave.length < MIN_CLAVE ? `Mínimo ${MIN_CLAVE} caracteres.`
      : repetida.length > 0 && repetida !== clave ? 'Las dos no coinciden.'
        : null;

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const { error } = await supabase.auth.updateUser({ password: clave, data: { [META_CLAVE_PROVISIONAL]: false } });
    setGuardando(false);
    if (error) { setAviso({ ok: false, texto: mensajeDeAuth(error) }); return; }
    setClave('');
    setRepetida('');
    setAviso({ ok: true, texto: 'Hecho. La próxima vez entra con la nueva.' });
  }

  return (
    <Card>
      <button onClick={() => setAbierta((x) => !x)} className="w-full min-h-[44px] text-left">
        <SectionLabel icon={<KeyRound size={14} />}>Cambiar mi contraseña</SectionLabel>
        <p className={cx(TEXT.muted)}>Si te la dio la academia, pon aquí una tuya.</p>
      </button>
      {abierta && (
        <div className="space-y-3 mt-2">
          <TextField label="Nueva contraseña" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
          <TextField label="Repítela" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
          {problema && <p className="text-xs text-amber-700 dark:text-amber-400">{problema}</p>}
          <Button size="sm" disabled={guardando || !!problema || clave.length < MIN_CLAVE || clave !== repetida} onClick={guardar}
            icon={guardando ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}>
            Guardar contraseña
          </Button>
          {aviso && <p className={cx('text-xs font-semibold', aviso.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{aviso.texto}</p>}
        </div>
      )}
    </Card>
  );
}
