-- Dose de cardio declarada pelo aluno.
--
-- O que não existia: `inclui_cardio boolean` (0008) era TODA a voz do aluno
-- sobre cardio. Quantos dias, quantos minutos e em qual modalidade eram decisão
-- exclusiva da IA — o aluno só podia pedir em texto livre na conversa, o que não
-- é verificável depois nem agregável.
--
-- O que muda: três campos de DOSE no questionário. Eles não são só prompt: a
-- validação local do molde reprova o plano que os viola e o retry dirigido diz
-- exatamente o que corrigir (backend/services/dose_cardio.py).
--
-- Coerência garantida por constraint: dose só existe com inclui_cardio = true.
-- Sem isso, desmarcar o cardio deixaria "3 dias, 30 min" órfão no banco e a
-- próxima geração leria uma dose que o aluno já tinha descartado.
--
-- As modalidades são NOMES do catálogo (backend/data/catalogo_exercicios.json,
-- grupo "Cardio"). Não há FK: o catálogo é arquivo versionado do backend, não
-- tabela. A validação de pertinência vive no backend e na tela — aqui garantimos
-- apenas que a lista não tem vazio/nulo, que é o que viraria filtro silencioso.

-- ============================================================
-- 0. Lista de texto utilizável (sem elemento nulo nem em branco)
-- ============================================================
-- Em função, e não inline na constraint, porque CHECK não aceita subquery
-- (0A000) e detectar "  " exige percorrer os elementos: `array_position(.., '')`
-- só pega a string vazia exata. Mesmo padrão de _forca_motivo_recusa_valido.
create or replace function public._forca_lista_texto_util(p_lista text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_lista is null
     or (
       coalesce(array_length(p_lista, 1), 0) >= 1
       and array_position(p_lista, null) is null
       and not exists (select 1 from unnest(p_lista) item where btrim(item) = '')
     );
$$;

comment on function public._forca_lista_texto_util(text[]) is
  'Lista de texto sem elemento nulo nem em branco (ou nula). Usada em constraint — CHECK não aceita subquery direto.';

revoke all on function public._forca_lista_texto_util(text[]) from public, anon;
grant execute on function public._forca_lista_texto_util(text[]) to authenticated;

-- ============================================================
-- 1. Dose no questionário vivo
-- ============================================================
alter table public.questionario_usuario
  add column if not exists cardio_dias_semana    integer,
  add column if not exists cardio_minutos_sessao integer,
  add column if not exists cardio_modalidades    text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questionario_cardio_dias_check'
  ) then
    alter table public.questionario_usuario
      add constraint questionario_cardio_dias_check
      check (cardio_dias_semana is null or cardio_dias_semana between 1 and 7);
  end if;

  -- Teto de 180: acima disso não é dose de cardio dentro de um treino, é outra
  -- atividade — e um número absurdo viraria alvo impossível para o molde.
  if not exists (
    select 1 from pg_constraint where conname = 'questionario_cardio_minutos_check'
  ) then
    alter table public.questionario_usuario
      add constraint questionario_cardio_minutos_check
      check (cardio_minutos_sessao is null
             or cardio_minutos_sessao between 5 and 180);
  end if;

  -- Lista sem elemento vazio/nulo: um '' na lista filtraria o cardápio do
  -- prompt por um nome que não existe e o aluno receberia um plano sem cardio
  -- sem nunca ter pedido isso.
  if not exists (
    select 1 from pg_constraint where conname = 'questionario_cardio_modalidades_check'
  ) then
    alter table public.questionario_usuario
      add constraint questionario_cardio_modalidades_check
      check (public._forca_lista_texto_util(cardio_modalidades));
  end if;

  -- Coerência: quem não quer cardio não carrega dose de cardio.
  if not exists (
    select 1 from pg_constraint where conname = 'questionario_cardio_dose_coerente'
  ) then
    alter table public.questionario_usuario
      add constraint questionario_cardio_dose_coerente
      check (
        inclui_cardio
        or (cardio_dias_semana is null
            and cardio_minutos_sessao is null
            and cardio_modalidades is null)
      );
  end if;
end
$$;

comment on column public.questionario_usuario.cardio_dias_semana is
  'Dias por semana com cardio, declarado pelo aluno. Contrato: a validação do molde reprova quem o viola.';
comment on column public.questionario_usuario.cardio_minutos_sessao is
  'Minutos de cardio por sessão que tenha cardio. Validado com tolerância (ver dose_cardio.py).';
comment on column public.questionario_usuario.cardio_modalidades is
  'Nomes do catálogo (grupo Cardio) que o aluno aceita. Vazio/null = qualquer modalidade.';

-- ============================================================
-- 2. Histórico append-only precisa dos campos novos
-- ============================================================
-- O trigger da 0012 lista as colunas UMA A UMA: sem reescrevê-lo, a dose seria
-- descartada em silêncio do snapshot e o histórico mentiria sobre o que o aluno
-- pediu na época de cada plano.
alter table public.questionario_historico
  add column if not exists cardio_dias_semana    integer,
  add column if not exists cardio_minutos_sessao integer,
  add column if not exists cardio_modalidades    text[];

create or replace function public.snapshot_questionario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.questionario_historico (
    usuario_id, data_nascimento, genero, peso_kg, altura_cm,
    experiencia_treino, objetivo, tem_lesoes, lesoes_detalhes,
    dias_treino, inclui_cardio, inclui_alongamento, tempo_medio_treino_min,
    cardio_dias_semana, cardio_minutos_sessao, cardio_modalidades
  )
  values (
    new.usuario_id, new.data_nascimento, new.genero, new.peso_kg, new.altura_cm,
    new.experiencia_treino, new.objetivo, new.tem_lesoes, new.lesoes_detalhes,
    new.dias_treino, new.inclui_cardio, new.inclui_alongamento, new.tempo_medio_treino_min,
    new.cardio_dias_semana, new.cardio_minutos_sessao, new.cardio_modalidades
  );
  return new;
end;
$$;

revoke all on function public.snapshot_questionario() from public, anon;

-- ============================================================
-- Asserções
-- ============================================================
do $$
declare
  v_col text;
begin
  foreach v_col in array array['cardio_dias_semana', 'cardio_minutos_sessao', 'cardio_modalidades'] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'questionario_usuario'
         and column_name = v_col
    ) then
      raise exception 'asserção falhou: questionario_usuario.% não existe', v_col;
    end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'questionario_historico'
         and column_name = v_col
    ) then
      raise exception 'asserção falhou: questionario_historico.% não existe', v_col;
    end if;
    -- O snapshot tem de GRAVAR a coluna, não só ter espaço para ela.
    if position(v_col in pg_get_functiondef(
         'public.snapshot_questionario()'::regprocedure)) = 0 then
      raise exception 'asserção falhou: snapshot_questionario não grava %', v_col;
    end if;
  end loop;
end
$$;
