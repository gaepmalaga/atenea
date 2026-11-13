-- =============================================================================
-- Ranking de clase: cada alumno decide si sale (regla 126)
-- =============================================================================
--
-- POR QUÉ
-- El ranking de un examen en clase enseña a los demás quién va en cabeza. Por
-- defecto SALE todo el mundo (decisión del dueño, 13 nov), y cada alumno puede
-- salirse desde la propia pantalla. Quien se sale no aparece, no cuenta y
-- tampoco ve el ranking.
--
-- `false` = sale en el ranking. Se escribe y se lee con la clave de servicio,
-- acotado por el usuario de la sesión (regla 1); `profiles` ya tiene su RLS.
-- Es seguro repetirlo: no hace nada si la columna existe.
-- =============================================================================

alter table public.profiles
  add column if not exists ranking_oculto boolean not null default false;
