import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SB_URL || !SB_ANON_KEY) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/**
 * Cliente de Supabase ligado a la sesion del usuario que hace la peticion.
 *
 * Lee la sesion de las cookies (por eso el navegador debe usar
 * `createBrowserClient` de @supabase/ssr y no el cliente por defecto, que
 * guardaria la sesion en localStorage y el servidor nunca la veria).
 *
 * A diferencia de `supabaseAdmin`, este cliente SI respeta las politicas RLS.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(SB_URL!, SB_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Se llama desde un Server Component, donde las cookies son de solo
          // lectura. El refresco de token lo hace el cliente del navegador.
        }
      },
    },
  });
}
