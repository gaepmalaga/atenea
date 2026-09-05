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
