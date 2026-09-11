/**
 * ACADEMIAS (P11 · multi-academia, sin empezar en el resto del código).
 *
 * El slug es la URL de la academia (`/alphapol`, `/depol`…), así que dos
 * cosas no pueden pasar nunca: que colisione con una ruta de la propia
 * aplicación (`/admin`, `/api`…) y que dos academias compartan uno. Lo
 * primero se vigila aquí, en código, porque una lista de rutas reservadas no
 * tiene sentido como restricción de base de datos; lo segundo lo impone la
 * columna `UNIQUE` de `academies.slug` (docs/sql/P11-multi-academia.sql).
 *
 * Módulo puro (regla 21): sin este guion ejecutado, nada de esto tiene tabla
 * a la que escribir todavía. Se deja listo para cuando la haya.
 */

/**
 * Rutas que ya existen o podrían existir en la aplicación, más palabras que
 * confundirían a un alumno navegando (`login`, `superadmin`). Todo en
 * minúsculas: la comparación siempre normaliza antes.
 */
const RESERVED_ACADEMY_SLUGS = new Set([
  'admin', 'superadmin', 'api', 'app', 'auth', 'login', 'logout', 'register',
  'static', 'assets', 'public', 'www', '_next', 'icon', 'apple-icon',
  'favicon', 'manifest', 'robots', 'sitemap', 'principal', 'null', 'undefined',
]);

const SLUG_MIN = 2;
const SLUG_MAX = 30;

/**
 * Slug a partir del nombre de una academia: «Alpha Policía» -> «alpha-policia».
 * Misma normalización que `slugDeTipo` en `groups.ts` (quita tildes, minúsculas,
 * guiones), con su propio límite de longitud porque este va en la URL, no en
 * una etiqueta de panel.
 */
export function slugDeAcademia(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
}

/**
 * `true` si un slug es válido como URL de academia: solo minúsculas, dígitos
 * y guiones interiores, dentro de longitud, y no es una ruta reservada.
 */
export function esSlugValido(slug: string): boolean {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) return false;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return false;
  return !RESERVED_ACADEMY_SLUGS.has(slug);
}

export type AcademyInput = { slug: string; name: string };

/**
 * Normaliza lo que llegaría del formulario de alta de una academia (P11i, en
 * el panel de superadmin): nombre obligatorio, slug explícito o derivado del
 * nombre. `null` si no hay nombre o el slug (el que sea) no es válido —igual
 * que `normalizeGroupInput`, un dato a medio rellenar no se guarda (regla 50).
 */
export function normalizeAcademyInput(raw: Record<string, unknown>): AcademyInput | null {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
  if (!name) return null;

  const slugCrudo = typeof raw.slug === 'string' && raw.slug.trim() ? raw.slug : name;
  const slug = slugDeAcademia(slugCrudo);
  if (!esSlugValido(slug)) return null;

  return { slug, name };
}
