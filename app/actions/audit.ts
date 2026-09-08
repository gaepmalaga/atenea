'use server'
import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';

export type AuditRow = {
  id: string;
  actorId: string;
  actorEmail: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

/**
 * Las últimas acciones de administración.
 *
 * Sustituye a lo que antes era "Logs & Auditoría": las últimas 20 respuestas
 * de cualquier alumno, que no decía quién hizo qué ni servía para auditar
 * nada. Esto sí: quién borró un tema, quién apagó un módulo, quién publicó
 * preguntas.
 *
 * Si `admin_audit_log` todavía no existe —el guion de
 * `docs/sql/admin-audit-log.sql` está escrito y puede no haberse ejecutado
 * todavía— PostgREST devuelve un error de esquema. Se detecta ese caso en
 * concreto para decir la verdad en vez de un "error desconocido": no se ha
 * roto nada, falta ejecutar el guion.
 */
export async function getAdminAuditLog(limit = 50): Promise<
  { success: true; rows: AuditRow[] } | { success: false; error: string; tablaFalta?: boolean }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { data, error } = await supabaseAdmin
    .from('admin_audit_log')
    .select('id, actor_id, action, target, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, limit)));

  if (error) {
    // PostgREST: "Could not find the table 'public.admin_audit_log' in the schema cache".
    const tablaFalta = /could not find the table/i.test(error.message);
    return { success: false, error: error.message, tablaFalta };
  }

  const actorIds = [...new Set((data ?? []).map((r) => r.actor_id as string).filter(Boolean))];
  const correos = new Map<string, string>();
  if (actorIds.length) {
    const { data: perfiles } = await supabaseAdmin.from('profiles').select('id, email').in('id', actorIds);
    for (const p of perfiles ?? []) correos.set(p.id as string, (p.email as string) ?? '');
  }

  const rows: AuditRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    actorId: r.actor_id as string,
    actorEmail: correos.get(r.actor_id as string) ?? null,
    action: r.action as string,
    target: (r.target as string) ?? null,
    detail: (r.detail as Record<string, unknown>) ?? null,
    createdAt: r.created_at as string,
  }));

  return { success: true, rows };
}

export type SesionUsuario = {
  id: string;
  email: string | null;
  /** `'admin'` | `'student'` — lo que diga `profiles.role`. */
  rol: string;
  /** ISO del ÚLTIMO inicio de sesión, o `null` si no ha entrado nunca. */
  ultimoAcceso: string | null;
  /** ISO del alta de la cuenta. */
  alta: string | null;
};

/**
 * ÚLTIMO ACCESO DE CADA USUARIO — alumnos y admin.
 *
 * `admin_audit_log` solo registra acciones de administración; los inicios de
 * sesión los guarda Supabase en `auth.users.last_sign_in_at`. Esto los cruza
 * con `profiles` para poner el rol y ordena por quién ha entrado más
 * recientemente. Aquí SÍ salen los admin (a diferencia de la pestaña
 * «Alumnos», regla 54): el objeto es auditar quién entra, no a quién llamar.
 *
 * Supabase solo conserva la ÚLTIMA fecha por usuario, no el historial completo
 * de sesiones — para eso haría falta exponer `auth.audit_log_entries`, que no
 * pasa por PostgREST. Con `last_sign_in_at` basta para saber quién ha entrado
 * y cuándo fue la última vez.
 */
export async function getInicioSesiones(): Promise<
  { success: true; usuarios: SesionUsuario[]; sinFechas: boolean } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const [perfilesRes, sesionesRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, email, role, created_at'),
    // Si esto falla, se sigue: se pierden las fechas de conexión, no el panel.
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }).catch(() => null),
  ]);

  if (perfilesRes.error) return { success: false, error: perfilesRes.error.message };

  const acceso = new Map<string, string | null>();
  const altaAuth = new Map<string, string | null>();
  for (const u of sesionesRes?.data?.users ?? []) {
    acceso.set(u.id, u.last_sign_in_at ?? null);
    altaAuth.set(u.id, u.created_at ?? null);
  }

  const usuarios: SesionUsuario[] = (perfilesRes.data ?? []).map((p) => ({
    id: p.id as string,
    email: (p.email as string) ?? null,
    rol: (p.role as string) ?? 'student',
    ultimoAcceso: acceso.get(p.id as string) ?? null,
    alta: (p.created_at as string) ?? altaAuth.get(p.id as string) ?? null,
  }));

  // Quién ha entrado más recientemente primero; los que nunca, al final.
  usuarios.sort((a, b) => {
    if (!a.ultimoAcceso && !b.ultimoAcceso) return (a.email ?? '').localeCompare(b.email ?? '', 'es');
    if (!a.ultimoAcceso) return 1;
    if (!b.ultimoAcceso) return -1;
    return b.ultimoAcceso.localeCompare(a.ultimoAcceso);
  });

  return { success: true, usuarios, sinFechas: !sesionesRes };
}
