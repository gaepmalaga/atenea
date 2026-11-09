-- =============================================================================
-- EL CUADRANTE DE LA SEMANA DEL 9 AL 12 DE NOVIEMBRE (regla 100, 9 nov 2026)
-- =============================================================================
--
-- Lo pidió el dueño: pasar a la app la imagen del cuadrante que se mandó por
-- WhatsApp esa semana (16 celdas). La semana ya está publicada (regla 98): los
-- alumnos lo ven en cuanto se ejecute.
--
-- El tipo de cada sesión es el que sale del título (`tipoDeTitulo`): F.M + RDL
-- es fuerza; FLK, Boxeo y Jiujitsu, «otro». Las de Multi, a las 18:30.
-- Idempotente: si un grupo ya tiene sesión ese día, no se toca.
-- =============================================================================

insert into public.training_sessions
  (organization_id, class_id, session_date, kind, title, teacher_id, start_time, position, created_by)
select 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2'::uuid, v.grupo::uuid, v.dia::date, v.tipo, v.titulo, v.profe::uuid, v.hora::time, 0,
       '25d1d2ef-f328-40fd-956c-f37900a722d3'::uuid
  from (values
    -- LUNES 9: Kappa, Alpha, Zetta
    ('ae6d2474-1bf5-4eaf-b2ef-0159efd2d01e', '2026-11-09', 'otro',   'FLK 5.0',   'ac9ed365-aef0-45e4-aa46-e4fce282a7d9', null),
    ('130a0d55-1e32-49ff-b67d-d9201baa3e4b', '2026-11-09', 'otro',   'Boxeo',     '674b5383-8b38-4ecb-87f5-93237b3fb3c4', null),
    ('4ad2fe9d-66ea-40c1-a6da-3c1044ba1bdd', '2026-11-09', 'fuerza', 'F.M + RDL', '637de4f2-c024-4c80-a144-0111447d05a4', null),
    -- MARTES 10: Omega, Sigma, Betta, Delta y Multi
    ('41f995a9-4f2c-4b3a-9f4c-60d9c0c79d81', '2026-11-10', 'otro',   'Jiujitsu',  'fc978e7b-2c74-4367-b448-fd0380e47f57', null),
    ('1d04cee7-bb8a-42d8-a4cf-8e632a837bac', '2026-11-10', 'otro',   'FLK 5.0',   'ac9ed365-aef0-45e4-aa46-e4fce282a7d9', null),
    ('1d5e9163-0326-4630-bde1-aee70bc7d93c', '2026-11-10', 'otro',   'FLK 5.0',   '9fbbdf0a-9beb-4cb5-ba5b-f3aa43cd3fae', null),
    ('247676ef-c11f-4c0c-925a-03a886368c23', '2026-11-10', 'fuerza', 'F.M + RDL', '637de4f2-c024-4c80-a144-0111447d05a4', null),
    ('409170c0-16b1-4b18-8312-9dc55f0dd4ea', '2026-11-10', 'otro',   'Jiujitsu',  'fc978e7b-2c74-4367-b448-fd0380e47f57', '18:30'),
    -- MIÉRCOLES 11: Kappa, Alpha, Zetta
    ('ae6d2474-1bf5-4eaf-b2ef-0159efd2d01e', '2026-11-11', 'fuerza', 'F.M + RDL', '637de4f2-c024-4c80-a144-0111447d05a4', null),
    ('130a0d55-1e32-49ff-b67d-d9201baa3e4b', '2026-11-11', 'otro',   'FLK 5.1',   'ac9ed365-aef0-45e4-aa46-e4fce282a7d9', null),
    ('4ad2fe9d-66ea-40c1-a6da-3c1044ba1bdd', '2026-11-11', 'otro',   'FLK 5.1',   '9fbbdf0a-9beb-4cb5-ba5b-f3aa43cd3fae', null),
    -- JUEVES 12: Omega, Sigma, Betta, Delta y Multi
    ('41f995a9-4f2c-4b3a-9f4c-60d9c0c79d81', '2026-11-12', 'otro',   'FLK 5.1',   '9fbbdf0a-9beb-4cb5-ba5b-f3aa43cd3fae', null),
    ('1d04cee7-bb8a-42d8-a4cf-8e632a837bac', '2026-11-12', 'fuerza', 'F.M + RDL', 'ac9ed365-aef0-45e4-aa46-e4fce282a7d9', null),
    ('1d5e9163-0326-4630-bde1-aee70bc7d93c', '2026-11-12', 'fuerza', 'F.M + RDL', '637de4f2-c024-4c80-a144-0111447d05a4', null),
    ('247676ef-c11f-4c0c-925a-03a886368c23', '2026-11-12', 'otro',   'FLK 5.0',   'ac9ed365-aef0-45e4-aa46-e4fce282a7d9', null),
    ('409170c0-16b1-4b18-8312-9dc55f0dd4ea', '2026-11-12', 'otro',   'Boxeo',     '674b5383-8b38-4ecb-87f5-93237b3fb3c4', '18:30')
  ) as v(grupo, dia, tipo, titulo, profe, hora)
 where not exists (
   select 1 from public.training_sessions s
    where s.class_id = v.grupo::uuid and s.session_date = v.dia::date
 );

-- COMPROBACIÓN
--   select session_date, g.name, title, st.name from training_sessions s
--     join class_groups g on g.id = s.class_id left join academy_staff st on st.id = s.teacher_id
--    where session_date between '2026-11-09' and '2026-11-15' order by 1, g.created_at;   -- 16 filas
