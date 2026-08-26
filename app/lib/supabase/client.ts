'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de Supabase para el navegador.
 *
 * IMPORTANTE: usa `createBrowserClient` de @supabase/ssr, que guarda la sesion
 * en COOKIES. El cliente por defecto de @supabase/supabase-js la guarda en
 * localStorage, que el servidor no puede leer: con aquel, ninguna Server Action
 * podria verificar quien llama.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
