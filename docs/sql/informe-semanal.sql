-- =============================================================================
-- La actividad de cada alumno, semana a semana (regla 116)
-- =============================================================================
--
-- POR QUÉ
-- El informe semanal y las señales de abandono necesitan saber cuánto ha hecho
-- cada alumno ESTA semana y cuánto venía haciendo. Traer las respuestas al
-- servidor para contarlas no escala (regla 91: 100 alumnos son cientos de
-- miles de filas): las cuentas las hace la base de datos y llegan los totales.
--
-- QUÉ DEVUELVE
-- Una fila por alumno y semana con actividad, de las últimas `p_semanas`
-- semanas (la actual incluida). La semana empieza el LUNES y va en la hora de
-- la academia (Europe/Madrid, regla 82): una respuesta de un domingo a las
-- 23:30 es de esa semana, no de la siguiente.
--
--   contestadas   respuestas que no son blanco
--   aciertos      de esas, las acertadas
--   blancos       las dejadas en blanco
--   dias_activos  días distintos con alguna respuesta
--   simulacros    exámenes entregados (exam_id distintos)
--   ultima        la última respuesta de esa semana
--
-- Solo la llama el servidor con la clave de servicio, con los ids de UNA
-- academia (regla 65): por eso se revoca a `anon` y `authenticated`.
-- =============================================================================

create or replace function public.panel_actividad_semanal(p_user_ids uuid[], p_semanas int default 6)
returns table (
  user_id uuid,
  semana date,
  contestadas int,
  aciertos int,
  blancos int,
  dias_activos int,
  simulacros int,
  ultima timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select qa.user_id,
         date_trunc('week', qa.created_at at time zone 'Europe/Madrid')::date as semana,
         count(*) filter (where qa.selected_index is distinct from -1)::int as contestadas,
         count(*) filter (where qa.selected_index is distinct from -1 and qa.is_correct)::int as aciertos,
         count(*) filter (where qa.selected_index = -1)::int as blancos,
         count(distinct (qa.created_at at time zone 'Europe/Madrid')::date)::int as dias_activos,
         count(distinct qa.exam_id)::int as simulacros,
         max(qa.created_at) as ultima
  from public.question_attempts qa
  where qa.user_id = any(p_user_ids)
    and qa.created_at >= (date_trunc('week', now() at time zone 'Europe/Madrid')
                          - make_interval(weeks => greatest(p_semanas, 1) - 1)) at time zone 'Europe/Madrid'
  group by 1, 2;
$fn$;

revoke execute on function public.panel_actividad_semanal(uuid[], int) from public, anon, authenticated;
grant execute on function public.panel_actividad_semanal(uuid[], int) to service_role;
