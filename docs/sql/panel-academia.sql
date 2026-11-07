-- EL PANEL «ALUMNOS» HACE LAS CUENTAS EN LA BASE DE DATOS (regla 91, 6 nov 2026)
--
-- Para pintar «Alumnos», la app traía a memoria TODAS las respuestas de TODOS
-- los alumnos de la academia, con un tope de 20.000. Con 100 alumnos
-- estudiando a diario ese tope se pasa en semanas: a partir de ahí el panel
-- cortaba en silencio (los totales salían de una parte del histórico) y cada
-- vez tardaba más en abrir.
--
-- Estas tres funciones hacen las sumas en Postgres y devuelven solo lo que el
-- panel pinta. La lógica de qué cuenta como contestada, blanco o acierto es la
-- misma que la de `app/lib/academy.ts` (un blanco es `selected_index = -1`;
-- `null` es «no se sabe» y cuenta como contestada, regla 24), y los tests de
-- `tests/academy.test.ts` comparan las dos vías con los mismos datos.
--
-- Solo las puede llamar la clave de servicio: el panel ya va con ella detrás de
-- `requireAdmin` (regla 35), y a un alumno no le sirve para nada ver las cuentas
-- de toda su academia.

-- 1 · Los totales: por alumno, por tema y las preguntas que falla casi todo el mundo.
create or replace function public.panel_academia_resumen(
  p_user_ids uuid[],
  p_min_intentos int default 5,
  p_max_winrate int default 25
) returns json
language sql stable
set search_path = public
as $$
  select json_build_object(
    'alumnos', coalesce((
      select json_agg(x) from (
        select user_id,
               count(*) filter (where selected_index is distinct from -1)::int as contestadas,
               count(*) filter (where selected_index = -1)::int as blancos,
               count(*) filter (where selected_index is distinct from -1 and is_correct)::int as aciertos,
               max(created_at) as ultima
        from question_attempts
        where user_id = any(p_user_ids)
        group by user_id
      ) x), '[]'::json),
    'temas', coalesce((
      select json_agg(x) from (
        select btrim(topic) as topic, count(distinct user_id)::int as alumnos
        from question_attempts
        where user_id = any(p_user_ids) and coalesce(btrim(topic), '') <> ''
        group by btrim(topic)
      ) x), '[]'::json),
    'preguntas', coalesce((
      select json_agg(x) from (
        select question_id,
               count(*)::int as veces,
               count(*) filter (where is_correct)::int as aciertos
        from question_attempts
        where user_id = any(p_user_ids)
          and question_id is not null
          and selected_index is distinct from -1
        group by question_id
        having count(*) >= p_min_intentos
           and round(100.0 * count(*) filter (where is_correct) / count(*)) <= p_max_winrate
      ) x), '[]'::json)
  );
$$;

-- 2 · Los pares de preguntas que se fallan juntas (regla 73, `detectaConfusion`).
--
-- Una fila por (alumno, pregunta): si algún intento la falló, cuenta como
-- fallada; los blancos no cuentan. Los candidatos salen SOLO de los fallos (dos
-- preguntas del mismo tema que el mismo alumno falló), que es lo que lo hace
-- barato: cruzar todo con todo crece con el cuadrado de lo contestado. Después
-- se cuenta, para cada candidato, cuántos alumnos contestaron las dos. El
-- `lift` y los umbrales los aplica `confusionDesdeConteos` en
-- `app/lib/question-confusion.ts`.
create or replace function public.panel_academia_confusion(
  p_user_ids uuid[],
  p_min_n int default 8,
  p_min_cofallos int default 2
) returns json
language sql stable
set search_path = public
as $$
  with r as (
    select user_id, question_id, max(topic) as topic, bool_and(coalesce(is_correct, false)) as ok
    from question_attempts
    where user_id = any(p_user_ids)
      and question_id is not null
      and selected_index is distinct from -1
    group by user_id, question_id
  ),
  q as (
    select question_id, count(*)::int as n, count(*) filter (where not ok)::int as f
    from r group by question_id
  ),
  fallos as (
    select r.user_id, r.question_id, r.topic
    from r join q using (question_id)
    where not r.ok and q.n >= p_min_n
  ),
  candidatos as (
    select a.question_id as qa, b.question_id as qb, count(*)::int as co_f
    from fallos a
    join fallos b on b.user_id = a.user_id and b.topic = a.topic and a.question_id < b.question_id
    group by a.question_id, b.question_id
    having count(*) >= p_min_cofallos
  ),
  co as (
    select c.qa, c.qb, c.co_f, count(*)::int as co_n, max(ra.topic) as topic
    from candidatos c
    join r ra on ra.question_id = c.qa
    join r rb on rb.question_id = c.qb and rb.user_id = ra.user_id and rb.topic = ra.topic
    group by c.qa, c.qb, c.co_f
    having count(*) >= p_min_n
  )
  select coalesce(json_agg(json_build_object(
    'a', co.qa, 'b', co.qb, 'topic', co.topic, 'coN', co.co_n, 'coFallo', co.co_f,
    'nA', qa.n, 'fA', qa.f, 'nB', qb.n, 'fB', qb.f
  )), '[]'::json)
  from co
  join q qa on qa.question_id = co.qa
  join q qb on qb.question_id = co.qb;
$$;

-- 3 · Para «esta semana el sistema ha llevado N preguntas a dominadas».
--
-- El cajón de una pregunta solo cambia cuando el alumno la contesta, así que lo
-- que pasó a dominada en los últimos 7 días sale EXACTO con el histórico de las
-- preguntas que tocó en esos 7 días: no hace falta todo lo demás. Devuelve
-- filas (no un json) para que la app pueda paginarlas.
create or replace function public.panel_academia_semana(p_user_ids uuid[])
returns table (
  user_id uuid, topic text, is_correct boolean, error_type text, created_at timestamptz,
  question_id uuid, selected_index smallint, confidence smallint
)
language sql stable
set search_path = public
as $$
  select qa.user_id, qa.topic, qa.is_correct, qa.error_type, qa.created_at,
         qa.question_id, qa.selected_index, qa.confidence
  from question_attempts qa
  where qa.user_id = any(p_user_ids)
    and qa.question_id is not null
    and (qa.user_id, qa.question_id) in (
      select distinct user_id, question_id
      from question_attempts
      where user_id = any(p_user_ids)
        and question_id is not null
        and created_at >= now() - interval '7 days'
    );
$$;

revoke execute on function public.panel_academia_resumen(uuid[], int, int) from public, anon, authenticated;
revoke execute on function public.panel_academia_confusion(uuid[], int, int) from public, anon, authenticated;
revoke execute on function public.panel_academia_semana(uuid[]) from public, anon, authenticated;
grant execute on function public.panel_academia_resumen(uuid[], int, int) to service_role;
grant execute on function public.panel_academia_confusion(uuid[], int, int) to service_role;
grant execute on function public.panel_academia_semana(uuid[]) to service_role;
