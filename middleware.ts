import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { esSlugValido, ACADEMIA_COOKIE } from './app/lib/academies';

/**
 * RESUELVE LA ACADEMIA DE LA URL A UNA COOKIE (P11).
 *
 * `/alphapol`, `/depol`… son la puerta de cada academia, pero las Server
 * Actions no ven la URL desde la que se llaman — solo cookies. Este
 * middleware es el único sitio que traduce «la ruta que se visitó» a «la
 * cookie que `getSessionUser` (app/lib/auth.ts) lee para resolver
 * `organizationId`» — sin tocar la base de datos aquí: comprobar que el slug
 * EXISTE de verdad y que el usuario pertenece a esa academia es cosa del
 * servidor (`app/[academia]/page.tsx` y `resolveOrganizationId`), no de este
 * middleware, que no debe depender de una consulta a Supabase en el runtime
 * Edge por cada petición.
 *
 * Para el caso de HOY —todo el mundo en una sola academia, por el backfill
 * del guion— esta cookie ni siquiera hace falta: `resolveOrganizationId`
 * resuelve sola cuando solo hay una academia posible. Solo importa el día que
 * una cuenta pertenezca a varias.
 */
export function middleware(request: NextRequest) {
  const primerSegmento = request.nextUrl.pathname.split('/')[1] ?? '';
  if (!esSlugValido(primerSegmento)) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(ACADEMIA_COOKIE, primerSegmento, {
    path: '/',
    sameSite: 'lax',
    // Medio año: no hace falta volver a `/<slug>` en cada visita para que la
    // sesión recuerde de qué academia es.
    maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}

export const config = {
  // Todo menos los internos de Next, los assets con extensión y `/api`.
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
