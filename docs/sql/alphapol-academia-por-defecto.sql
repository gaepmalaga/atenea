-- =============================================================================
-- ALPHAPOL COMO ACADEMIA POR DEFECTO DEL REGISTRO (regla 81, 6 nov 2026)
-- =============================================================================
--
-- POR QUÉ
-- El disparador de P11j (`P11j-asignar-academia-en-registro.sql`) mete a cada
-- cuenta nueva en una academia: la del slug que manda el registro, y si no
-- llega ninguno, en la academia «casa» `atenea`. Atenea se retiró: la
-- plataforma es ahora de Alphapol y la academia `atenea` se borra con
-- `npm run limpiar`. Sin este cambio, una cuenta creada SIN slug —desde el
-- panel de Supabase, por ejemplo— se quedaría sin academia («No hemos
-- encontrado tu academia»).
--
-- El registro desde la aplicación YA manda siempre `alphapol` (`AppShell.tsx`),
-- así que esto es la red de debajo, no el camino principal.
--
-- Solo cambia la función; el disparador sigue siendo el mismo. Idempotente:
-- se puede ejecutar más de una vez.
-- =============================================================================

create or replace function public.asigna_academia_en_registro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_academy_id uuid;
begin
  v_slug := new.raw_user_meta_data->>'academia_slug';

  if v_slug is not null and v_slug <> '' then
    select id into v_academy_id from public.academies where slug = v_slug;
  end if;

  -- Sin slug, o un slug que no existe: Alphapol. Si ni siquiera esa existiera,
  -- se deja sin asignar antes que colar a alguien en una academia equivocada.
  if v_academy_id is null then
    select id into v_academy_id from public.academies where slug = 'alphapol';
  end if;

  if v_academy_id is not null then
    insert into public.academy_members (academy_id, user_id)
    values (v_academy_id, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN
-- -----------------------------------------------------------------------------
--   select prosrc like '%''alphapol''%' as apunta_a_alphapol
--   from pg_proc where proname = 'asigna_academia_en_registro';
--   -- true
