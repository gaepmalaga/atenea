import { notFound } from 'next/navigation';
import { esSlugValido } from '@/app/lib/academies';
import { supabaseAdmin } from '@/app/actions/core';
import AppShell from '@/app/components/AppShell';

/**
 * LA PUERTA DE UNA ACADEMIA (P11): `/alphapol`, `/depol`, `/corporepol`…
 *
 * `middleware.ts` ya dejó la cookie con el slug antes de que esto se
 * renderice; lo único que hace esta ruta es comprobar que el slug tiene forma
 * válida y que existe de verdad en `academies` — un slug inventado da 404, no
 * una pantalla de login que no lleva a ningún sitio. La resolución real de
 * `organizationId` (y la comprobación de que el usuario PERTENECE a esta
 * academia) la hace el servidor en cada Server Action, vía
 * `resolveOrganizationId` (`app/lib/auth.ts`) — aquí no hay sesión todavía.
 */
export default async function AcademiaPage({
  params,
}: {
  params: Promise<{ academia: string }>;
}) {
  const { academia } = await params;

  if (!esSlugValido(academia)) notFound();

  const { data } = await supabaseAdmin
    .from('academies')
    .select('id')
    .eq('slug', academia)
    .maybeSingle();

  if (!data) notFound();

  return <AppShell />;
}
