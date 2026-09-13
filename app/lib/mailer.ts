import 'server-only';

/**
 * CORREOS QUE MANDA LA PROPIA APP (P12), NO SUPABASE AUTH.
 *
 * Avisar a un admin de que hay una solicitud de alta nueva, o avisarle a un
 * alumno de si se le acepta o no, es la app decidiendo mandar un correo por
 * su cuenta — Supabase Auth solo manda SUS propios correos (confirmar cuenta,
 * invitación, recuperar clave).
 *
 * Empezó con la cuenta Gmail (`atenea.alumnos@gmail.com`) por SMTP directo,
 * pero Google bloqueó esa cuenta por sospecha de bot y dejó el envío cortado
 * sin previsión de cuándo se resuelve. Se migró (12 sep 2026) a **Resend**
 * sobre un dominio propio (`ateneapolicial.com`, comprado en Cloudflare y
 * verificado en Resend con sus registros DNS): un proveedor transaccional de
 * verdad, sin el riesgo de que una cuenta personal de Gmail se bloquee de la
 * noche a la mañana. Es la llamada REST directa, sin el SDK de Resend: la
 * API es una sola petición HTTP, y añadir una dependencia entera para eso no
 * compensa.
 *
 * Nunca lanza (mismo patrón que `ai-usage.ts` / `admin-audit.ts`): un fallo de
 * correo no puede tirarse por delante la acción que lo dispara — dar de alta
 * a un alumno tiene que quedar hecho aunque el aviso no llegue.
 */

type CorreoParams = { to: string | string[]; subject: string; html: string };

const REMITENTE = 'Atenea Policial <notificaciones@ateneapolicial.com>';

export async function sendMail({ to, subject, html }: CorreoParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[correo] falta RESEND_API_KEY: no se manda', { subject, to });
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: REMITENTE, to, subject, html }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      console.error('[correo] Resend respondió con error:', res.status, detalle, { subject, to });
    }
  } catch (e) {
    console.error('[correo] no se pudo mandar:', e instanceof Error ? e.message : e, { subject, to });
  }
}
