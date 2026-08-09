-- Anamnese de cardio declarada pelo aluno (REQ-04).
--
-- O que não existia: o questionário já capturava DOSE de cardio (dias/semana,
-- minutos/sessão, modalidades — migration 0021), mas nunca capturava EXPERIÊNCIA.
-- Sem saber se o aluno já corre/pedala, qual distância confortável e qual o
-- objetivo, não há como calibrar dose inicial conservadora nem teto de
-- progressão — a IA recebia a dose declarada mas nenhum sinal de capacidade.
--
-- O que muda: três campos de ANAMNESE no questionário. `nivel_cardio_declarado()`
-- (backend/services/dose_cardio.py) vai ler estas colunas para derivar um nível
-- (iniciante/intermediário/avançado) deterministicamente, sem depender de
-- inferência livre do modelo — mesma filosofia de `dose_declarada()`.
--
-- Coerência garantida por constraint: assim como a dose (0021), a anamnese só
-- existe com inclui_cardio = true. Sem isso, desmarcar o cardio deixaria a
-- anamnese órfã no banco e a próxima geração leria experiência que o aluno já
-- havia descartado ao recusar cardio.
--
-- `cardio_distancia_confortavel_km` só faz sentido para quem já pratica hoje —
-- por isso a constraint adicional de coerência entre as duas colunas.
--
-- `cardio_objetivo` usa um vocabulário FECHADO (enum via CHECK, não texto
-- livre): o mesmo valor é o `value` das opções que o frontend vai usar no
-- Plano 02-03. Texto livre nunca vira "contrato" que entra no prompt como
-- instrução — só valor de lista fechada ganha essa autoridade (padrão já
-- estabelecido por `canonicalizar_modalidades_cardio`).

-- ============================================================
-- 1. Anamnese no questionário vivo
-- ============================================================
alter table public.questionario_usuario
  add column if not exists cardio_pratica_atualmente        boolean,
  add column if not exists cardio_distancia_confortavel_km  numeric,
  add column if not exists cardio_objetivo                  text;

do $$
begin
  -- Teto de 50km: distância confortável acima disso não é um dado plausível de
  -- anamnese — um número absurdo viraria alvo impossível para o molde (mesmo
  -- espírito de questionario_cardio_minutos_check, 0021, faixa 5-180).
  if not exists (
    select 1 from pg_constraint where conname = 'questionario_cardio_distancia_km_check'
  ) then
    alter table public.questionario_usuario
      add constraint questionario_cardio_distancia_km_check
      check (cardio_distancia_confortavel_km is null
             or cardio_distancia_confortavel_km between 0 and 50);
  end if;

  -- Vocabulário fechado: estes 3 literais EXATOS são os mesmos que o frontend
  -- vai usar como `value` das opções de objetivo (Plano 02-03).
  if not exists (
    select 1 from pg_constraint where conname = 'questionario_cardio_objetivo_check'
  ) then
    alter table public.questionario_usuario
      add constraint questionario_cardio_objetivo_check
      check (cardio_objetivo is null
             or cardio_objetivo in ('condicionamento', 'completar_5k', 'emagrecimento'));
  end if;

  -- Coerência: só quem pratica cardio HOJE declara distância confortável —
  -- sem isso, "não pratico" com "5km confortáveis" ficaria contraditório e
  -- silencioso no banco.
  if not exists (
    select 1 from pg_constraint where conname = 'questionario_cardio_distancia_coerente'
  ) then
    alter table public.questionario_usuario
      add constraint questionario_cardio_distancia_coerente
      check (cardio_distancia_confortavel_km is null
             or cardio_pratica_atualmente is true);
  end if;

  -- Coerência: quem não quer cardio no plano não carrega anamnese de cardio.
  if not exists (
    select 1 from pg_constraint where conname = 'questionario_anamnese_cardio_coerente'
  ) then
    alter table public.questionario_usuario
      add constraint questionario_anamnese_cardio_coerente
      check (
        inclui_cardio
        or (cardio_pratica_atualmente is null
            and cardio_distancia_confortavel_km is null
            and cardio_objetivo is null)
      );
  end if;
end
$$;

comment on column public.questionario_usuario.cardio_pratica_atualmente is
  'Se o aluno já pratica cardio hoje (corre/pedala/etc.), declarado na anamnese. Contrato: nivel_cardio_declarado() lê esta coluna para calibrar dose inicial e teto de progressão.';
comment on column public.questionario_usuario.cardio_distancia_confortavel_km is
  'Distância confortável (km) que o aluno já consegue hoje, só preenchida quando cardio_pratica_atualmente = true. Lida por nivel_cardio_declarado().';
comment on column public.questionario_usuario.cardio_objetivo is
  'Objetivo declarado do cardio: condicionamento, completar_5k ou emagrecimento. Vocabulário fechado — lido por nivel_cardio_declarado().';

-- ============================================================
-- 2. Histórico append-only precisa dos campos novos
-- ============================================================
-- O trigger lista as colunas UMA A UMA: sem reescrevê-lo, a anamnese seria
-- descartada em silêncio do snapshot e o histórico mentiria sobre o que o
-- aluno declarou na época de cada plano.
alter table public.questionario_historico
  add column if not exists cardio_pratica_atualmente        boolean,
  add column if not exists cardio_distancia_confortavel_km  numeric,
  add column if not exists cardio_objetivo                  text;

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
    cardio_dias_semana, cardio_minutos_sessao, cardio_modalidades,
    cardio_pratica_atualmente, cardio_distancia_confortavel_km, cardio_objetivo
  )
  values (
    new.usuario_id, new.data_nascimento, new.genero, new.peso_kg, new.altura_cm,
    new.experiencia_treino, new.objetivo, new.tem_lesoes, new.lesoes_detalhes,
    new.dias_treino, new.inclui_cardio, new.inclui_alongamento, new.tempo_medio_treino_min,
    new.cardio_dias_semana, new.cardio_minutos_sessao, new.cardio_modalidades,
    new.cardio_pratica_atualmente, new.cardio_distancia_confortavel_km, new.cardio_objetivo
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
  foreach v_col in array array[
    'cardio_pratica_atualmente',
    'cardio_distancia_confortavel_km',
    'cardio_objetivo'
  ] loop
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
