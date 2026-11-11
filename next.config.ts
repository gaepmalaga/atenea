import type { NextConfig } from "next";

/**
 * CABECERAS DE SEGURIDAD (regla 112).
 *
 * No había ninguna: la aplicación se podía meter en un marco de otra página
 * (para hacer pulsar a un alumno donde no ve), y el navegador no tenía dicho
 * de dónde puede cargar código ni a dónde puede mandar datos.
 *
 * La política de contenido es la más estricta que admite Next sin «nonces»:
 * los guiones solo de la propia aplicación, y las conexiones solo a ella y al
 * proyecto de Supabase. `'unsafe-inline'` en guiones hace falta porque Next
 * inyecta los suyos en línea, y `layout.tsx` lleva el que pone el tema antes
 * de pintar; `'unsafe-eval'` solo en desarrollo (lo usa la recarga en caliente).
 *
 * El micrófono se deja para la propia aplicación: lo usa la entrevista.
 */
function origenSupabase(): { https: string; wss: string } | null {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    return { https: `https://${u.host}`, wss: `wss://${u.host}` };
  } catch {
    return null;
  }
}

const enDesarrollo = process.env.NODE_ENV !== 'production';
const supabase = origenSupabase();

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${enDesarrollo ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // `blob:` y `data:`: la imagen del cuadrante para WhatsApp y las descargas
  // (lista del alta en bloque, recibos) se generan en el navegador.
  // El origen de Supabase también: las fotos de los alumnos salen de su
  // almacenamiento (regla 114).
  `img-src 'self' data: blob:${supabase ? ` ${supabase.https}` : ''}`,
  "font-src 'self' data:",
  `connect-src 'self'${supabase ? ` ${supabase.https} ${supabase.wss}` : ''}${enDesarrollo ? ' ws:' : ''}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const CABECERAS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), microphone=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Aumentamos el límite a 10 Megas para permitir PDFs grandes
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: CABECERAS }];
  },
};

export default nextConfig;
