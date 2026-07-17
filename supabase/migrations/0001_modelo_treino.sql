-- Fase 3 — Modelo de dados novo do treino (Opção A do docs/modelo-dados.md).
-- Plano → sessões planejadas → exercícios → séries-alvo, e execução real
-- (session_logs/set_logs). As tabelas legadas fato_*/dim_* ficam intocadas.
-- Escrita sempre com o JWT do usuário (RLS abaixo); nada de service role.

-- ============================================================
-- 1. Plano (programa/mesociclo gerado pela IA)
-- ============================================================
create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_plan_id uuid,               -- treinamento_id do JSON da IA
  name text not null,
  description text,
  periodization_type text,
  duration_weeks integer not null default 12 check (duration_weeks >= 1),
  sessions_per_week integer not null default 3 check (sessions_per_week >= 1),
  start_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'archived')),
  raw_plan jsonb,                    -- JSON original da IA (auditoria/reprocessamento)
  created_by text not null default 'ai' check (created_by in ('ai', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index training_plans_user_status_idx on public.training_plans (user_id, status);

-- O app já grava profiles.current_plan_id ao concluir o onboarding
-- (PostQuestionnaireChat); a coluna passa a existir de fato aqui.
alter table public.profiles
  add column if not exists current_plan_id uuid
    references public.training_plans (id) on delete set null;

-- ============================================================
-- 2. Sessões planejadas (um "treino" do plano)
-- ============================================================
create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans (id) on delete cascade,
  -- user_id denormalizado: simplifica RLS e a consulta "treino de hoje"
  user_id uuid not null references auth.users (id) on delete cascade,
  week_number integer not null check (week_number >= 1),
  day_of_week text,                  -- como veio da IA (ex.: 'segunda')
  order_in_week integer not null default 1,
  title text not null,
  session_type text,
  scheduled_date date,
  estimated_minutes integer,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  muscle_groups text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index planned_sessions_plan_idx on public.planned_sessions (plan_id);
create index planned_sessions_user_date_idx
  on public.planned_sessions (user_id, status, scheduled_date);

-- ============================================================
-- 3. Exercícios planejados
-- ============================================================
create table public.planned_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.planned_sessions (id) on delete cascade,
  exercise_order integer not null,
  name text not null,
  muscle_group text,
  priority text not null default 'accessory'
    check (priority in ('primary', 'secondary', 'accessory')),
  equipment text,
  load_increment_kg numeric not null default 2.5,
  rest_seconds integer,
  target_rm_percent numeric check (target_rm_percent between 0 and 100),
  sets_planned integer not null default 1,
  reps_raw text,                     -- faixa original da IA (ex.: '8-12', 'AMRAP')
  method text,
  cadence text,
  notes text,
  injury_flags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index planned_exercises_session_idx on public.planned_exercises (session_id);

-- ============================================================
-- 4. Séries-alvo (uma linha por série; a adaptação da Fase 5 escreve aqui)
-- ============================================================
create table public.planned_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.planned_exercises (id) on delete cascade,
  set_order integer not null check (set_order >= 1),
  target_reps_min integer not null check (target_reps_min >= 1),
  target_reps_max integer not null check (target_reps_max >= target_reps_min),
  target_load_kg numeric,            -- null até o aluno informar a 1ª carga (Fase 4)
  target_rir integer check (target_rir between 0 and 10),
  created_at timestamptz not null default now()
);

create index planned_sets_exercise_idx on public.planned_sets (exercise_id);

-- ============================================================
-- 5. Execução real (Fase 4 grava aqui; criadas já para fechar o modelo)
-- ============================================================
create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  planned_session_id uuid not null references public.planned_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  available_minutes integer,
  adherence_snapshot jsonb,          -- estado da semana no início (Fase 6)
  created_at timestamptz not null default now()
);

create index session_logs_user_idx on public.session_logs (user_id, started_at desc);
create index session_logs_session_idx on public.session_logs (planned_session_id);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  session_log_id uuid not null references public.session_logs (id) on delete cascade,
  planned_set_id uuid references public.planned_sets (id) on delete set null,
  actual_reps integer not null check (actual_reps >= 0),
  actual_load_kg numeric,
  actual_rir integer check (actual_rir between 0 and 10),
  outcome text check (outcome in ('on_target', 'under', 'over')),
  adaptation jsonb,                  -- decisão aplicada (Fase 5)
  completed_at timestamptz not null default now()
);

create index set_logs_session_log_idx on public.set_logs (session_log_id);

-- ============================================================
-- 6. RLS — cada usuário só enxerga e escreve o que é dele
-- ============================================================
alter table public.training_plans enable row level security;
alter table public.planned_sessions enable row level security;
alter table public.planned_exercises enable row level security;
alter table public.planned_sets enable row level security;
alter table public.session_logs enable row level security;
alter table public.set_logs enable row level security;

create policy "own plans" on public.training_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own sessions" on public.planned_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Filhos herdam a posse via pai (EXISTS), em leitura e escrita
create policy "own exercises" on public.planned_exercises
  for all using (
    exists (
      select 1 from public.planned_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.planned_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "own sets" on public.planned_sets
  for all using (
    exists (
      select 1
      from public.planned_exercises e
      join public.planned_sessions s on s.id = e.session_id
      where e.id = exercise_id and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.planned_exercises e
      join public.planned_sessions s on s.id = e.session_id
      where e.id = exercise_id and s.user_id = auth.uid()
    )
  );

create policy "own session logs" on public.session_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own set logs" on public.set_logs
  for all using (
    exists (
      select 1 from public.session_logs l
      where l.id = session_log_id and l.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.session_logs l
      where l.id = session_log_id and l.user_id = auth.uid()
    )
  );
