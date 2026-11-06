/**
 * LOS CORREOS QUE MANDA LA APP (P12), NO SUPABASE AUTH.
 *
 * Módulo puro (regla 21): construye asunto + HTML, no manda nada — eso lo
 * hace `mailer.ts`. Con la marca de la academia (regla 81): cabecera marino
 * con el nombre en dorado, filete dorado y botón marino. Las plantillas de
 * Supabase (confirmar cuenta, invitación, recuperar clave) viven en el panel de
 * Supabase y hay que cambiarlas allí a mano, con los mismos colores.
 */

import { MARCA } from './marca.ts';

const { marino, dorado, doradoClaro } = MARCA.colores;

function envoltorio(tituloInterno: string, cuerpoHtml: string, cta?: { texto: string; url: string }): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;max-width:480px;width:100%;">
        <tr><td style="background:${marino};padding:18px 24px;">
          <span style="color:${doradoClaro};font-size:13px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">${MARCA.nombre}</span>
          <span style="color:#f7f4ee;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">&nbsp;·&nbsp;${MARCA.lema}</span>
        </td></tr>
        <tr><td style="height:6px;background:${dorado};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 28px;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:900;color:${marino};">${tituloInterno}</h1>
          <div style="font-size:14px;line-height:1.6;color:#3d4a5a;">${cuerpoHtml}</div>
          ${cta ? `<div style="margin-top:26px;"><a href="${cta.url}" style="display:inline-block;background:${marino};color:#ffffff;text-decoration:none;font-weight:900;font-size:13px;letter-spacing:.04em;text-transform:uppercase;padding:14px 22px;">${cta.texto}</a></div>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function plantillaSolicitudAdmin(params: {
  alumnoEmail: string;
  academiaName: string;
  panelUrl: string;
}): { subject: string; html: string } {
  const { alumnoEmail, academiaName, panelUrl } = params;
  return {
    subject: `Nueva solicitud de alta en ${academiaName}`,
    html: envoltorio(
      'Alguien quiere entrar',
      `<p><strong>${alumnoEmail}</strong> se ha registrado en <strong>${academiaName}</strong> y espera a que le des acceso.</p>
       <p>Entra en el panel para aceptar o rechazar la solicitud.</p>`,
      { texto: 'Ver la solicitud', url: panelUrl },
    ),
  };
}

export function plantillaAccesoConcedido(params: { academiaName: string; appUrl: string }): { subject: string; html: string } {
  const { academiaName, appUrl } = params;
  return {
    subject: `Ya tienes acceso en ${academiaName}`,
    html: envoltorio(
      'Ya puedes entrar',
      `<p><strong>${academiaName}</strong> te ha dado acceso a su plataforma de estudio. Ya puedes entrar con tu correo y tu contraseña y empezar a estudiar.</p>`,
      { texto: 'Entrar a estudiar', url: appUrl },
    ),
  };
}

export function plantillaAccesoRechazado(params: { academiaName: string }): { subject: string; html: string } {
  const { academiaName } = params;
  return {
    subject: `Tu solicitud en ${academiaName} no ha sido aceptada`,
    html: envoltorio(
      'Tu acceso no está activo',
      `<p><strong>${academiaName}</strong> no te ha dado acceso a la plataforma. Si crees que es un error, ponte en contacto directamente con ellos.</p>`,
    ),
  };
}
