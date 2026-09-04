-- ============================================================================
-- EL HISTORIAL DEL CHAT
--
-- QUÉ RESUELVE
-- Hoy la conversación vive en el `sessionStorage` del navegador: se borra al
-- cerrar la pestaña y no llega nunca a la base de datos. Un alumno que hace
-- una buena pregunta el martes no puede releer la respuesta el jueves.
--
-- LA IDEA QUE HAY DETRÁS, Y QUE ES LA CORRECTA: guardar y usar como contexto
-- son dos cosas distintas. Guardar es casi gratis; lo que cuesta es meter el
-- historial en el prompt. Así que se guarda TODO y se manda al modelo MUY
-- POCO.
--
-- LA REGLA QUE NO SE PUEDE ROMPER AL IMPLEMENTARLO
-- Una conversación ABIERTA necesita sus últimos turnos. Es la regla 11, y salió
-- de un fallo real: `askAtenea` solo embebía la frase actual, así que «¿y qué
-- plazo aplica en ese caso?» no recuperaba NADA del temario. Si «el historial
-- no es contexto» se aplica también a la conversación abierta, ese fallo
-- vuelve. Lo correcto: el ARCHIVO nunca es contexto; la conversación abierta
-- arrastra los últimos turnos (4 es un buen número).
--
-- ES IDEMPOTENTE.
-- ============================================================================

create table if not exists public.chat_conversations (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  -- El título sale de la primera pregunta. Se guarda en vez de derivarse para
  -- que renombrar una conversación sea posible sin tocar los mensajes.
  title       text        not null default 'Consulta',
  -- El tema elegido en el desplegable, si lo hubo. Es lo que distingue una
  -- conversación cara (documento entero) de una barata (fragmentos).
  subject_id  integer,
  -- Una conversación CERRADA ya no aporta contexto a ninguna pregunta nueva:
  -- se puede consultar, pero no viaja al modelo. Es lo que hace que guardar
  -- todo el historial no cueste dinero.
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.chat_conversations(id) on delete cascade,
  -- Se repite el usuario aunque ya esté en la conversación: RLS por fila es
  -- mucho más simple y más difícil de equivocar que una política con subconsulta.
  user_id         uuid        not null references auth.users(id) on delete cascade,
  role            text        not null check (role in ('user', 'ai')),
  content         text        not null,
  -- Las fuentes que sostuvieron la respuesta, tal cual se pintaron. Sin esto,
  -- releer una respuesta de hace un mes no permite comprobar de dónde salió.
  sources         jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists chat_conv_user   on public.chat_conversations (user_id, updated_at desc);
create index if not exists chat_msg_conv    on public.chat_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS DE PROPIETARIO. Una conversación es del alumno, como sus notas.
--
-- IMPORTANTE (regla 34): estas tablas SÍ tienen políticas, así que se leen y
-- escriben con el cliente de la SESIÓN (`createSupabaseServerClient()`), NO con
-- `supabaseAdmin`. Con la clave de servicio, RLS no protege nada y la única
-- barrera vuelve a ser acordarse de escribir `.eq('user_id', …)`.
-- ---------------------------------------------------------------------------
alter table public.chat_conversations enable row level security;
alter table public.chat_messages      enable row level security;

-- SIN BLOQUE `do $$`, y no es estilo: al pegar esto en el editor SQL del
-- panel desde un movil, el editor auto-cerro un parentesis detras del
-- `end $$;` y la consulta entera fallo con
--   ERROR: 42601: syntax error at or near ")"
-- Un guion que solo se puede pegar sin que el editor lo toque es un guion
-- fragil. `drop policy if exists` da la misma idempotencia sin `$$` de por
-- medio, y aqui eso vale mas que la elegancia.
drop policy if exists conv_propietario on public.chat_conversations;
create policy conv_propietario on public.chat_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists msg_propietario on public.chat_messages;
create policy msg_propietario on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Las políticas cubren SELECT, INSERT, UPDATE y DELETE (`for all`). Es a
-- propósito: `question_attempts` se quedó sin política de UPDATE y el
-- diagnóstico del error del alumno se perdía EN SILENCIO — el update no
-- fallaba, simplemente no tocaba ninguna fila.
