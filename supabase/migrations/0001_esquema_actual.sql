-- =============================================================================
-- Esquema de Atenea — volcado del proyecto real
-- =============================================================================
--
-- Generado por `npm run schema:migration`. NO editar a mano: los cambios se
-- hacen en la base de datos y luego se vuelve a volcar.
--
-- Este fichero existe porque el esquema solo vivia dentro de Supabase. Sin una
-- copia en el repo, el codigo y la base de datos derivaron sin que nada lo
-- cantara: se escribian columnas inexistentes y PostgREST rechazaba la
-- escritura entera en silencio.
--
-- Fecha del volcado: 2026-08-26
-- Tablas: 22   ·   Politicas: 26
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ==========================================================================
-- Tablas
-- ==========================================================================

-- --------------------------------------------------------------------------
create table if not exists public.ai_quota (
  user_id uuid not null,
  bucket text not null,
  count integer not null default 0,
  reset_at timestamp with time zone not null
);

-- --------------------------------------------------------------------------
create table if not exists public.blocks (
  id integer not null default nextval('blocks_id_seq'::regclass),
  name text not null
);

-- --------------------------------------------------------------------------
create table if not exists public.content_documents (
  id bigint not null,
  title text not null,
  slug text not null,
  source text default 'upload'::text,
  doc_type text default 'law'::text,
  version text,
  published_at date,
  status text not null default 'active'::text,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- --------------------------------------------------------------------------
create table if not exists public.document_chunks (
  id bigint not null default nextval('document_chunks_id_seq'::regclass),
  document_id uuid,
  content_chunk text,
  embedding vector
);

-- --------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid not null default gen_random_uuid(),
  subject_id integer,
  filename text not null,
  full_text text,
  uploaded_at timestamp with time zone default now()
);

-- --------------------------------------------------------------------------
create table if not exists public.exam_questions (
  exam_id uuid not null,
  position integer not null,
  question_id uuid not null
);

-- --------------------------------------------------------------------------
create table if not exists public.exams (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  topic text not null,
  mode text not null default 'practice'::text,
  total_questions integer not null,
  started_at timestamp with time zone not null default timezone('utc'::text, now()),
  finished_at timestamp with time zone,
  meta jsonb default '{}'::jsonb
);

-- --------------------------------------------------------------------------
create table if not exists public.flashcard_bank (
  id uuid not null default gen_random_uuid(),
  topic text not null,
  front text not null,
  back text not null,
  source_refs jsonb,
  card_hash text not null,
  status text not null default 'active'::text,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- --------------------------------------------------------------------------
create table if not exists public.flashcard_progress (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  topic text not null,
  front text not null,
  back text not null,
  box integer default 1,
  next_review timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  card_id uuid
);

-- --------------------------------------------------------------------------
create table if not exists public.flashcard_results (
  id bigint not null,
  user_id uuid not null,
  subject_id bigint,
  topic text not null,
  front text not null,
  back text not null,
  grade text not null,
  box_before integer,
  box_after integer,
  next_review timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- --------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid not null,
  email text,
  role text default 'student'::text,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- --------------------------------------------------------------------------
create table if not exists public.profiles_biodata (
  user_id uuid not null,
  family_background text,
  studies_motivation text,
  work_history text,
  leisure_activities text,
  police_motivation text,
  fears_concerns text,
  strengths_weaknesses text,
  legal_issues text,
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  psych_answers jsonb default '{}'::jsonb,
  psych_profile jsonb default '{"sincerity": 5, "stability": 5, "leadership": 5, "normativity": 5}'::jsonb
);

-- --------------------------------------------------------------------------
create table if not exists public.profiles_physical (
  user_id uuid not null,
  height numeric,
  weight numeric,
  age integer,
  gender text,
  injuries text,
  baseline_test jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  birth_year integer,
  exam_date date,
  training_level text,
  baseline_metrics jsonb,
  availability integer default 5,
  equipment text default 'gym'::text
);

-- --------------------------------------------------------------------------
create table if not exists public.profiles_psych (
  user_id uuid not null,
  factor_estabilidad integer default 5,
  factor_norma integer default 5,
  factor_atrevimiento integer default 5,
  factor_vigilancia integer default 5,
  factor_ansiedad integer default 5,
  sinceridad_score integer default 100,
  last_test_date timestamp with time zone
);

-- --------------------------------------------------------------------------
create table if not exists public.question_attempts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  exam_id uuid,
  question_id uuid,
  topic text not null,
  is_correct boolean not null,
  selected_index smallint,
  error_type text,
  response_time_ms integer,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  option_changes integer not null default 0
);

-- --------------------------------------------------------------------------
create table if not exists public.question_bank (
  id uuid not null default gen_random_uuid(),
  subject_id integer,
  document_id uuid,
  question_text text not null,
  options jsonb not null,
  correct_index integer not null,
  explanation text,
  question_hash text,
  difficulty_level integer default 2,
  status text default 'candidate'::text,
  origin text default 'bank'::text,
  global_success_rate double precision default 0,
  created_at timestamp with time zone default now()
);

-- --------------------------------------------------------------------------
create table if not exists public.question_reports (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  question_id uuid,
  report_type text,
  message text,
  status text default 'open'::text,
  created_at timestamp with time zone default now()
);

-- --------------------------------------------------------------------------
create table if not exists public.question_votes (
  question_id uuid not null,
  user_id uuid not null,
  vote integer
);

-- --------------------------------------------------------------------------
create table if not exists public.subjects (
  id integer not null default nextval('subjects_id_seq'::regclass),
  block_id integer,
  topic_number integer not null,
  title text not null,
  description text
);

-- --------------------------------------------------------------------------
create table if not exists public.test_results (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  question_id uuid,
  is_correct boolean,
  response_time_ms integer,
  option_changes integer default 0,
  created_at timestamp with time zone default now()
);

-- --------------------------------------------------------------------------
create table if not exists public.training_plans (
  id uuid not null default extensions.uuid_generate_v4(),
  user_id uuid,
  week_start date,
  plan_data jsonb,
  status text default 'active'::text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- --------------------------------------------------------------------------
create table if not exists public.workout_logs (
  id uuid not null default extensions.uuid_generate_v4(),
  user_id uuid,
  plan_id uuid,
  date date,
  session_type text,
  metrics jsonb,
  rpe integer,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- ==========================================================================
-- Claves primarias, ajenas, unicidad y checks
-- ==========================================================================

alter table public.ai_quota drop constraint if exists ai_quota_pkey;
alter table public.ai_quota add constraint ai_quota_pkey PRIMARY KEY (user_id, bucket);
alter table public.blocks drop constraint if exists blocks_pkey;
alter table public.blocks add constraint blocks_pkey PRIMARY KEY (id);
alter table public.content_documents drop constraint if exists content_documents_pkey;
alter table public.content_documents add constraint content_documents_pkey PRIMARY KEY (id);
alter table public.document_chunks drop constraint if exists document_chunks_pkey;
alter table public.document_chunks add constraint document_chunks_pkey PRIMARY KEY (id);
alter table public.documents drop constraint if exists documents_pkey;
alter table public.documents add constraint documents_pkey PRIMARY KEY (id);
alter table public.exam_questions drop constraint if exists exam_questions_pkey;
alter table public.exam_questions add constraint exam_questions_pkey PRIMARY KEY (exam_id, "position");
alter table public.exams drop constraint if exists exams_pkey;
alter table public.exams add constraint exams_pkey PRIMARY KEY (id);
alter table public.flashcard_bank drop constraint if exists flashcard_bank_pkey;
alter table public.flashcard_bank add constraint flashcard_bank_pkey PRIMARY KEY (id);
alter table public.flashcard_progress drop constraint if exists flashcard_progress_pkey;
alter table public.flashcard_progress add constraint flashcard_progress_pkey PRIMARY KEY (id);
alter table public.flashcard_results drop constraint if exists flashcard_results_pkey;
alter table public.flashcard_results add constraint flashcard_results_pkey PRIMARY KEY (id);
alter table public.profiles drop constraint if exists profiles_pkey;
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles_biodata drop constraint if exists profiles_biodata_pkey;
alter table public.profiles_biodata add constraint profiles_biodata_pkey PRIMARY KEY (user_id);
alter table public.profiles_physical drop constraint if exists profiles_physical_pkey;
alter table public.profiles_physical add constraint profiles_physical_pkey PRIMARY KEY (user_id);
alter table public.profiles_psych drop constraint if exists profiles_psych_pkey;
alter table public.profiles_psych add constraint profiles_psych_pkey PRIMARY KEY (user_id);
alter table public.question_attempts drop constraint if exists question_attempts_pkey;
alter table public.question_attempts add constraint question_attempts_pkey PRIMARY KEY (id);
alter table public.question_bank drop constraint if exists question_bank_pkey;
alter table public.question_bank add constraint question_bank_pkey PRIMARY KEY (id);
alter table public.question_reports drop constraint if exists question_reports_pkey;
alter table public.question_reports add constraint question_reports_pkey PRIMARY KEY (id);
alter table public.question_votes drop constraint if exists question_votes_pkey;
alter table public.question_votes add constraint question_votes_pkey PRIMARY KEY (question_id, user_id);
alter table public.subjects drop constraint if exists subjects_pkey;
alter table public.subjects add constraint subjects_pkey PRIMARY KEY (id);
alter table public.test_results drop constraint if exists test_results_pkey;
alter table public.test_results add constraint test_results_pkey PRIMARY KEY (id);
alter table public.training_plans drop constraint if exists training_plans_pkey;
alter table public.training_plans add constraint training_plans_pkey PRIMARY KEY (id);
alter table public.workout_logs drop constraint if exists workout_logs_pkey;
alter table public.workout_logs add constraint workout_logs_pkey PRIMARY KEY (id);
alter table public.blocks drop constraint if exists blocks_name_key;
alter table public.blocks add constraint blocks_name_key UNIQUE (name);
alter table public.question_bank drop constraint if exists question_bank_question_hash_key;
alter table public.question_bank add constraint question_bank_question_hash_key UNIQUE (question_hash);
alter table public.subjects drop constraint if exists subjects_topic_number_key;
alter table public.subjects add constraint subjects_topic_number_key UNIQUE (topic_number);
alter table public.ai_quota drop constraint if exists ai_quota_user_id_fkey;
alter table public.ai_quota add constraint ai_quota_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.document_chunks drop constraint if exists document_chunks_document_id_fkey;
alter table public.document_chunks add constraint document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
alter table public.documents drop constraint if exists documents_subject_id_fkey;
alter table public.documents add constraint documents_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
alter table public.exam_questions drop constraint if exists exam_questions_exam_id_fkey;
alter table public.exam_questions add constraint exam_questions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
alter table public.flashcard_progress drop constraint if exists flashcard_progress_card_id_fkey;
alter table public.flashcard_progress add constraint flashcard_progress_card_id_fkey FOREIGN KEY (card_id) REFERENCES flashcard_bank(id);
alter table public.flashcard_progress drop constraint if exists flashcard_progress_user_id_fkey;
alter table public.flashcard_progress add constraint flashcard_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles_biodata drop constraint if exists profiles_biodata_user_id_fkey;
alter table public.profiles_biodata add constraint profiles_biodata_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.profiles_physical drop constraint if exists profiles_physical_user_id_fkey;
alter table public.profiles_physical add constraint profiles_physical_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.profiles_psych drop constraint if exists profiles_psych_user_id_fkey;
alter table public.profiles_psych add constraint profiles_psych_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.question_attempts drop constraint if exists question_attempts_exam_id_fkey;
alter table public.question_attempts add constraint question_attempts_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
alter table public.question_attempts drop constraint if exists question_attempts_question_id_fkey;
alter table public.question_attempts add constraint question_attempts_question_id_fkey FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE SET NULL;
alter table public.question_bank drop constraint if exists question_bank_document_id_fkey;
alter table public.question_bank add constraint question_bank_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
alter table public.question_bank drop constraint if exists question_bank_subject_id_fkey;
alter table public.question_bank add constraint question_bank_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
alter table public.question_reports drop constraint if exists question_reports_question_id_fkey;
alter table public.question_reports add constraint question_reports_question_id_fkey FOREIGN KEY (question_id) REFERENCES question_bank(id);
alter table public.question_reports drop constraint if exists question_reports_user_id_fkey;
alter table public.question_reports add constraint question_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.question_votes drop constraint if exists question_votes_question_id_fkey;
alter table public.question_votes add constraint question_votes_question_id_fkey FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE;
alter table public.question_votes drop constraint if exists question_votes_user_id_fkey;
alter table public.question_votes add constraint question_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.subjects drop constraint if exists subjects_block_id_fkey;
alter table public.subjects add constraint subjects_block_id_fkey FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE;
alter table public.test_results drop constraint if exists test_results_question_id_fkey;
alter table public.test_results add constraint test_results_question_id_fkey FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE;
alter table public.test_results drop constraint if exists test_results_user_id_fkey;
alter table public.test_results add constraint test_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.training_plans drop constraint if exists training_plans_user_id_fkey;
alter table public.training_plans add constraint training_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.workout_logs drop constraint if exists workout_logs_plan_id_fkey;
alter table public.workout_logs add constraint workout_logs_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES training_plans(id);
alter table public.workout_logs drop constraint if exists workout_logs_user_id_fkey;
alter table public.workout_logs add constraint workout_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- ==========================================================================
-- Indices
-- ==========================================================================

create index if not exists ai_quota_reset_at_idx ON public.ai_quota USING btree (reset_at);
create unique index if not exists content_documents_slug_uq ON public.content_documents USING btree (slug);
create index if not exists exam_questions_question_idx ON public.exam_questions USING btree (question_id);
create index if not exists exams_topic_idx ON public.exams USING btree (topic);
create index if not exists exams_user_id_idx ON public.exams USING btree (user_id);
create index if not exists exams_user_idx ON public.exams USING btree (user_id);
create unique index if not exists flashcard_bank_hash_uq ON public.flashcard_bank USING btree (card_hash);
create index if not exists flashcard_bank_topic_idx ON public.flashcard_bank USING btree (topic);
create index if not exists flashcard_progress_next_review_idx ON public.flashcard_progress USING btree (next_review);
create index if not exists flashcard_progress_user_idx ON public.flashcard_progress USING btree (user_id);
create index if not exists idx_flashcard_review ON public.flashcard_progress USING btree (user_id, next_review);
create index if not exists flashcard_results_subject_idx ON public.flashcard_results USING btree (subject_id);
create index if not exists flashcard_results_user_idx ON public.flashcard_results USING btree (user_id);
create index if not exists qa_exam_idx ON public.question_attempts USING btree (exam_id);
create index if not exists qa_question_idx ON public.question_attempts USING btree (question_id);
create index if not exists qa_user_idx ON public.question_attempts USING btree (user_id);
create index if not exists question_attempts_question_idx ON public.question_attempts USING btree (question_id);
create index if not exists question_attempts_user_created_idx ON public.question_attempts USING btree (user_id, created_at DESC);
create index if not exists question_attempts_user_idx ON public.question_attempts USING btree (user_id);
create index if not exists idx_qbank_subject ON public.question_bank USING btree (subject_id);
create index if not exists idx_subjects_block ON public.subjects USING btree (block_id);
create index if not exists idx_results_user_algo ON public.test_results USING btree (user_id, question_id);

-- ==========================================================================
-- Row Level Security
-- ==========================================================================

-- Las tablas de contenido salen con RLS activa y SIN politicas: es a proposito.
-- Significa acceso directo DENEGADO con la clave publica; la aplicacion las lee
-- con la clave de servicio, que salta RLS. Ver docs/sql/1.3-activar-rls.sql.

alter table public.ai_quota enable row level security;
alter table public.blocks enable row level security;
alter table public.content_documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.documents enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exams enable row level security;
alter table public.flashcard_bank enable row level security;
alter table public.flashcard_progress enable row level security;
alter table public.flashcard_results enable row level security;
alter table public.profiles enable row level security;
alter table public.profiles_biodata enable row level security;
alter table public.profiles_physical enable row level security;
alter table public.profiles_psych enable row level security;
alter table public.question_attempts enable row level security;
alter table public.question_bank enable row level security;
alter table public.question_reports enable row level security;
alter table public.question_votes enable row level security;
alter table public.subjects enable row level security;
alter table public.test_results enable row level security;
alter table public.training_plans enable row level security;
alter table public.workout_logs enable row level security;

drop policy if exists "Users can insert exam_questions of own exams" on public.exam_questions;
create policy "Users can insert exam_questions of own exams" on public.exam_questions
  for insert
  to public
  with check ((EXISTS ( SELECT 1
   FROM exams e
  WHERE ((e.id = exam_questions.exam_id) AND (e.user_id = auth.uid())))));

drop policy if exists "Users can read exam_questions of own exams" on public.exam_questions;
create policy "Users can read exam_questions of own exams" on public.exam_questions
  for select
  to public
  using ((EXISTS ( SELECT 1
   FROM exams e
  WHERE ((e.id = exam_questions.exam_id) AND (e.user_id = auth.uid())))));

drop policy if exists "Users can create their exams" on public.exams;
create policy "Users can create their exams" on public.exams
  for insert
  to public
  with check ((auth.uid() = user_id));

drop policy if exists "Users can insert own exams" on public.exams;
create policy "Users can insert own exams" on public.exams
  for insert
  to public
  with check ((auth.uid() = user_id));

drop policy if exists "Users can select own exams" on public.exams;
create policy "Users can select own exams" on public.exams
  for select
  to public
  using ((auth.uid() = user_id));

drop policy if exists "Users can update own exams" on public.exams;
create policy "Users can update own exams" on public.exams
  for update
  to public
  using ((auth.uid() = user_id));

drop policy if exists "Users can update their exams" on public.exams;
create policy "Users can update their exams" on public.exams
  for update
  to public
  using ((auth.uid() = user_id));

drop policy if exists "Users can view their exams" on public.exams;
create policy "Users can view their exams" on public.exams
  for select
  to public
  using ((auth.uid() = user_id));

drop policy if exists "Users can CRUD own flashcard_progress" on public.flashcard_progress;
create policy "Users can CRUD own flashcard_progress" on public.flashcard_progress
  for all
  to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

drop policy if exists "Users can insert own flashcard_results" on public.flashcard_results;
create policy "Users can insert own flashcard_results" on public.flashcard_results
  for insert
  to public
  with check ((auth.uid() = user_id));

drop policy if exists "Users can select own flashcard_results" on public.flashcard_results;
create policy "Users can select own flashcard_results" on public.flashcard_results
  for select
  to public
  using ((auth.uid() = user_id));

drop policy if exists "profiles_leer_propio" on public.profiles;
create policy "profiles_leer_propio" on public.profiles
  for select
  to authenticated
  using ((id = auth.uid()));

drop policy if exists "Users can update own biodata" on public.profiles_biodata;
create policy "Users can update own biodata" on public.profiles_biodata
  for insert
  to public
  with check ((auth.uid() = user_id));

drop policy if exists "Users can update own biodata update" on public.profiles_biodata;
create policy "Users can update own biodata update" on public.profiles_biodata
  for update
  to public
  using ((auth.uid() = user_id));

drop policy if exists "Users can view own biodata" on public.profiles_biodata;
create policy "Users can view own biodata" on public.profiles_biodata
  for select
  to public
  using ((auth.uid() = user_id));

drop policy if exists "profiles_physical_propietario" on public.profiles_physical;
create policy "profiles_physical_propietario" on public.profiles_physical
  for all
  to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "Users can update own psych" on public.profiles_psych;
create policy "Users can update own psych" on public.profiles_psych
  for insert
  to public
  with check ((auth.uid() = user_id));

drop policy if exists "Users can view own psych" on public.profiles_psych;
create policy "Users can view own psych" on public.profiles_psych
  for select
  to public
  using ((auth.uid() = user_id));

drop policy if exists "Users can insert own attempts" on public.question_attempts;
create policy "Users can insert own attempts" on public.question_attempts
  for insert
  to public
  with check ((auth.uid() = user_id));

drop policy if exists "Users can select own attempts" on public.question_attempts;
create policy "Users can select own attempts" on public.question_attempts
  for select
  to public
  using ((auth.uid() = user_id));

drop policy if exists "Users can view own attempts" on public.question_attempts;
create policy "Users can view own attempts" on public.question_attempts
  for select
  to public
  using ((auth.uid() = user_id));

drop policy if exists "question_reports_propietario" on public.question_reports;
create policy "question_reports_propietario" on public.question_reports
  for all
  to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "question_votes_propietario" on public.question_votes;
create policy "question_votes_propietario" on public.question_votes
  for all
  to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "test_results_propietario" on public.test_results;
create policy "test_results_propietario" on public.test_results
  for all
  to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "training_plans_propietario" on public.training_plans;
create policy "training_plans_propietario" on public.training_plans
  for all
  to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "workout_logs_propietario" on public.workout_logs;
create policy "workout_logs_propietario" on public.workout_logs
  for all
  to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

-- ==========================================================================
-- Funciones del proyecto
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_user_id uuid, p_bucket text, p_limit integer, p_window interval)
 RETURNS TABLE(allowed boolean, remaining integer, reset_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count    integer;
  v_reset    timestamptz;
begin
  insert into public.ai_quota (user_id, bucket, count, reset_at)
  values (p_user_id, p_bucket, 1, now() + p_window)
  on conflict (user_id, bucket) do update
    set count    = case when public.ai_quota.reset_at <= now() then 1
                        else public.ai_quota.count + 1 end,
        reset_at = case when public.ai_quota.reset_at <= now() then now() + p_window
                        else public.ai_quota.reset_at end
  returning public.ai_quota.count, public.ai_quota.reset_at into v_count, v_reset;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_reset;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'student'); -- Por defecto todos son estudiantes
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.match_document_chunks(query_embedding vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id bigint, content_chunk text, similarity double precision, filename text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content_chunk,
    1 - (dc.embedding <=> query_embedding) as similarity,
    d.filename
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$;

