-- 0009: updated_at honesto no questionário.
--
-- A 0008 criou questionario_usuario com updated_at DEFAULT now() mas sem
-- trigger — o valor ficava congelado no INSERT. Com a re-submissão virando
-- UPSERT (Prefer: resolution=merge-duplicates no app), o UPDATE passa a ser um
-- caminho real e updated_at precisa refletir a última gravação de fato.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists questionario_usuario_set_updated_at on public.questionario_usuario;
create trigger questionario_usuario_set_updated_at
  before update on public.questionario_usuario
  for each row execute function public.set_updated_at();
