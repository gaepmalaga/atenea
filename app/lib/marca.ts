/**
 * LA MARCA DE LA PLATAFORMA, en un solo sitio (regla 81).
 *
 * Desde noviembre de 2026 la plataforma es de Alphapol, una academia de
 * Málaga: su nombre, su logo y sus colores, sacados de su web
 * (https://alphapol.es) mientras no den unos definitivos. Antes era «Atenea
 * Policial», un producto para varias academias; esa marca se retiró entera.
 *
 * Todo texto que el alumno o el admin ve con el nombre de la plataforma sale
 * de aquí. El fallo que evita es el de siempre (reglas 3 y 6): el nombre
 * estaba escrito a mano en 22 ficheros, y cambiarlo era ir a buscarlo uno a
 * uno sabiendo que alguno se quedaría.
 *
 * Lo que NO sale de aquí, a propósito: las claves de `localStorage`, la cookie
 * de la academia y los nombres de funciones internas (`atenea-tema`,
 * `atenea-academia`, `askAtenea`…). No los ve nadie, y renombrarlos borraría
 * las preferencias guardadas de quien ya entró.
 *
 * Módulo PURO: sin imports, se puede leer desde el cliente, el servidor, el
 * middleware y las plantillas de correo.
 */

export const MARCA = {
  /** Como se escribe en una frase: «Bienvenido a Alphapol». */
  nombre: 'Alphapol',
  /** La segunda línea del logo. */
  lema: 'Centro de formación',
  /** Lo que es, para el `<title>` y el manifest. */
  descripcion: 'Academia de Policía Nacional en Málaga · plataforma de estudio',
  /** Su web pública (WordPress). La plataforma vive aparte. */
  web: 'https://alphapol.es',
  /** Contacto público de la academia, tal cual sale en su web. */
  correoContacto: 'info@alphapol.es',
  /**
   * El slug de la academia en la base de datos. Un alta que entra por `/` (sin
   * slug en la URL) cae aquí: con una sola academia no hay otra posible.
   */
  academiaSlug: 'alphapol',
  /**
   * La hora de la academia. El servidor (Vercel) va en UTC: sin esto, «hasta
   * que empiece la clase de las 17:00» se correría una o dos horas según la
   * época del año (regla 82).
   */
  zonaHoraria: 'Europe/Madrid',
  /** Donde está la academia. Lo enseña la pantalla de carga. */
  ciudad: 'Málaga',
  /** El logo de su web, servido desde `public/marca/`. */
  logo: '/marca/alphapol-logo.jpg',
  /**
   * La «A» del logo y el logotipo («ALPHAPOL · CENTRO DE FORMACIÓN»), cada uno
   * por separado y con el fondo transparente, recortados del JPG de su web.
   * Los usa la pantalla de carga. Son WebP a 3× y 6× del original para que no
   * se vean borrosos a tamaño grande; un logo en vector seguiría siendo mejor.
   */
  isotipo: '/marca/alphapol-isotipo.webp',
  logotipo: '/marca/alphapol-logotipo.webp',
  colores: {
    /** El azul marino del fondo del logo. */
    marino: '#14295a',
    /** El dorado de la «A» y de «ALPHA». */
    dorado: '#c5a738',
    /** Un dorado más claro para texto dorado sobre marino. */
    doradoClaro: '#e2c977',
  },
} as const;

/**
 * El remitente de los correos que manda la propia aplicación (`mailer.ts`).
 *
 * El dominio tiene que estar verificado en Resend: hoy solo lo está
 * `ateneapolicial.com`, así que por defecto se sigue mandando desde ahí, con
 * el NOMBRE de Alphapol delante. Cuando se verifique `alphapol.es`, basta con
 * definir `MAIL_FROM` (p. ej. `Alphapol <no-responder@alphapol.es>`) en Vercel;
 * no hay que tocar código.
 */
export function remitenteCorreo(): string {
  const deEntorno = typeof process !== 'undefined' ? process.env.MAIL_FROM?.trim() : '';
  return deEntorno || `${MARCA.nombre} <notificaciones@ateneapolicial.com>`;
}
