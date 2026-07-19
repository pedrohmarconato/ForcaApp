-- 0008: onboarding demográfico (questionario_usuario)
-- Cria a tabela que o app escreve em QuestionnaireScreen.tsx:68
-- (POST /rest/v1/questionario_usuario). Sem ela, o submit do questionário falha
-- com "relation does not exist". Payload canônico (QuestionnaireScreen.tsx:332):
--   usuario_id, data_nascimento, genero, peso_kg, altura_cm, experiencia_treino,
--   objetivo, tem_lesoes, lesoes_detalhes, dias_treino, inclui_cardio,
--   inclui_alongamento, tempo_medio_treino_min

create table if not exists public.questionario_usuario (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  data_nascimento date,
  genero text,
  peso_kg numeric check (peso_kg is null or peso_kg > 0),
  altura_cm integer check (altura_cm is null or altura_cm > 0),
  experiencia_treino text,
  objetivo text,
  tem_lesoes boolean not null default false,
  lesoes_detalhes text,
  dias_treino text[] not null default '{}',
  inclui_cardio boolean not null default false,
  inclui_alongamento boolean not null default false,
  tempo_medio_treino_min integer check (tempo_medio_treino_min is null or tempo_medio_treino_min > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.questionario_usuario enable row level security;

drop policy if exists "questionario select own" on public.questionario_usuario;
create policy "questionario select own" on public.questionario_usuario
  for select using (auth.uid() = usuario_id);

drop policy if exists "questionario insert own" on public.questionario_usuario;
create policy "questionario insert own" on public.questionario_usuario
  for insert with check (auth.uid() = usuario_id);

drop policy if exists "questionario update own" on public.questionario_usuario;
create policy "questionario update own" on public.questionario_usuario
  for update using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

grant select, insert, update on public.questionario_usuario to authenticated;
