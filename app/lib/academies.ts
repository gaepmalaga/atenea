/**
 * ACADEMIAS (P11 · multi-academia).
 *
 * El slug es la URL de la academia (`/alphapol`, `/depol`…), así que dos
 * cosas no pueden pasar nunca: que colisione con una ruta de la propia
 * aplicación (`/admin`, `/api`…) y que dos academias compartan uno. Lo
 * primero se vigila aquí, en código, porque una lista de rutas reservadas no
 * tiene sentido como restricción de base de datos; lo segundo lo impone la
 * columna `UNIQUE` de `academies.slug` (docs/sql/P11-multi-academia.sql).
 *
 * Módulo puro (regla 21): la aritmética del panel de superadmin
 * (`resumeAcademias`, P11f) también vive aquí, por lo mismo — se puede
 * testear sin Supabase.
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
 * La cookie que deja `middleware.ts` al visitar `/<slug>`, y que
 * `app/lib/auth.ts` lee para resolver la academia activa de la sesión
 * (`resolveOrganizationId`) cuando una cuenta pertenece a más de una. Vive
 * aquí, no en `auth.ts` (`server-only`), porque el middleware corre en el
 * runtime Edge y no puede importar ese módulo (arrastra Gemini y la clave de
 * servicio).
 */
export const ACADEMIA_COOKIE = 'atenea-academia';

/**
 * La academia «casa» (P11j, regla 65 y `docs/sql/P11j-asignar-academia-en-registro.sql`):
 * donde cae un alta sin slug, sin grupos ni cobro en persona. Vive como
 * constante porque el disparador de Postgres la tiene fija por su cuenta —
 * cambiar el slug ahí y no aquí (o al revés) dejaría los dos sitios
 * discrepando en silencio.
 */
export const ACADEMIA_CASA_SLUG = 'atenea';

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

/** Una fila de `academies`, tal y como la devuelve PostgREST. */
export type AcademyRow = { id: string; slug: string; name: string };

/** Una fila de `academy_members`. */
export type MiembroRow = { academy_id: string; user_id: string };

/** Un admin (o superadmin) de una academia, para la lista de «quién la lleva». */
export type AdminDeAcademia = { id: string; email: string | null };

/** El resumen de UNA academia para el panel transversal del superadmin (P11f). */
export type AcademyStats = {
  id: string;
  slug: string;
  name: string;
  alumnos: number;
  /** Quiénes la administran, no solo cuántos — el superadmin necesita saber a
   *  quién llamar, no solo un número (feedback al probar el panel). */
  admins: AdminDeAcademia[];
  /** Coste de IA acumulado de sus miembros (`ai_usage`, USD). */
  costeIA: number;
  /** Lo cobrado este mes (`monthly_payments.amount_eur`, solo lo pagado). */
  ingresosMes: number;
};

/**
 * Agrega academias, membresías, roles, gasto de IA y pagos del mes en la
 * comparativa del panel de superadmin.
 *
 * `ai_usage` NO lleva `organization_id` (decidido en P11: evita la ambigüedad
 * de a qué academia atribuir la llamada de un alumno que estuviera en dos, ver
 * docs/sql/P11-multi-academia.sql). Por eso el coste se atribuye aquí, al leer,
 * cruzando por `user_id` contra `academy_members` — y un alumno en DOS
 * academias (raro, decidido que puede pasar) cuenta su gasto en las dos: es
 * una aproximación deliberada, no un reparto a medias que nadie ha pedido.
 *
 * `monthly_payments` SÍ lleva `organization_id` (P11), así que los ingresos no
 * necesitan ese cruce: se agregan directamente por academia.
 */
export function resumeAcademias(
  academias: AcademyRow[],
  miembros: MiembroRow[],
  roles: Map<string, string>,
  costePorUsuario: Map<string, number>,
  pagosDelMes: { organization_id: string | null; amount_eur: number | null; paid: boolean }[],
  correos: Map<string, string | null> = new Map(),
): AcademyStats[] {
  const ingresosPorAcademia = new Map<string, number>();
  for (const p of pagosDelMes) {
    if (!p.paid || !p.organization_id) continue;
    const importe = typeof p.amount_eur === 'number' && Number.isFinite(p.amount_eur) ? p.amount_eur : 0;
    ingresosPorAcademia.set(p.organization_id, (ingresosPorAcademia.get(p.organization_id) ?? 0) + importe);
  }

  const miembrosPorAcademia = new Map<string, string[]>();
  for (const m of miembros) {
    const lista = miembrosPorAcademia.get(m.academy_id) ?? [];
    lista.push(m.user_id);
    miembrosPorAcademia.set(m.academy_id, lista);
  }

  return academias.map((a) => {
    const suyos = miembrosPorAcademia.get(a.id) ?? [];
    let alumnos = 0;
    const admins: AdminDeAcademia[] = [];
    let costeIA = 0;
    for (const userId of suyos) {
      const rol = roles.get(userId);
      if (rol === 'student' || !rol) alumnos++;
      else admins.push({ id: userId, email: correos.get(userId) ?? null });
      costeIA += costePorUsuario.get(userId) ?? 0;
    }
    return {
      id: a.id,
      slug: a.slug,
      name: a.name,
      alumnos,
      admins,
      costeIA,
      ingresosMes: ingresosPorAcademia.get(a.id) ?? 0,
    };
  });
}
