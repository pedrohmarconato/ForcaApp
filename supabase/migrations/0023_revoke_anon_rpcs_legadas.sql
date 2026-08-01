-- 0023 — RLS-01 do review defensivo de 31/07/2026.
--
-- A 0019 documentou que `revoke ... from public` NÃO corta `anon`: os default
-- privileges do Supabase concedem EXECUTE diretamente a anon/authenticated/
-- service_role na criação de QUALQUER função. Naquele PR o revoke de anon foi
-- aplicado só às três RPCs de reordenação, e o hardening das RPCs antigas
-- ficou registrado como follow-up. Este é o follow-up.
--
-- As duas RPCs abaixo revogam apenas de `public` (0014:247 e 0015:317), então
-- `anon` mantém EXECUTE por grant direto. Ambas falham fechadas — são
-- `security invoker` e a RLS das tabelas barra um `auth.uid()` nulo — de modo
-- que isto é defesa em profundidade: tira do chamador anônimo o acesso ao
-- parsing de argumentos e à superfície de erros, antes que a RLS precise ser
-- a única linha.
--
-- Assinaturas conferidas contra a última redefinição vigente de cada função:
--   save_set_log       → 0014:166 (10 parâmetros, inclui os campos de cardio)
--   save_training_plan → 0015:9   (4 jsonb)
-- Um revoke com assinatura errada não falha: ele acerta outra função ou
-- nenhuma. Por isso as asserções no fim conferem o efeito, não a execução.

revoke all on function public.save_set_log(
  uuid, uuid, int, numeric, int, text, timestamptz, int, numeric, text
) from anon;

revoke all on function public.save_training_plan(
  jsonb, jsonb, jsonb, jsonb
) from anon;

-- Reafirma o grant legítimo. As duas linhas são idempotentes e existem para
-- que a migration não dependa do estado deixado pela 0014/0015: se um revoke
-- futuro for largo demais, é aqui que o acesso do app volta.
grant execute on function public.save_set_log(
  uuid, uuid, int, numeric, int, text, timestamptz, int, numeric, text
) to authenticated;

grant execute on function public.save_training_plan(
  jsonb, jsonb, jsonb, jsonb
) to authenticated;

-- ============================================================
-- Asserções
-- ============================================================
do $$
begin
  -- anon perdeu EXECUTE nas duas assinaturas vigentes.
  if has_function_privilege('anon',
       'public.save_set_log(uuid, uuid, int, numeric, int, text, timestamptz, int, numeric, text)',
       'EXECUTE') then
    raise exception 'asserção falhou: anon ainda executa save_set_log';
  end if;

  if has_function_privilege('anon',
       'public.save_training_plan(jsonb, jsonb, jsonb, jsonb)',
       'EXECUTE') then
    raise exception 'asserção falhou: anon ainda executa save_training_plan';
  end if;

  -- O app continua funcionando: authenticated mantém EXECUTE. Sem esta metade
  -- um revoke largo demais passaria silencioso e só apareceria como falha de
  -- gravação de série no aparelho do usuário.
  if not has_function_privilege('authenticated',
       'public.save_set_log(uuid, uuid, int, numeric, int, text, timestamptz, int, numeric, text)',
       'EXECUTE') then
    raise exception 'asserção falhou: authenticated perdeu save_set_log';
  end if;

  if not has_function_privilege('authenticated',
       'public.save_training_plan(jsonb, jsonb, jsonb, jsonb)',
       'EXECUTE') then
    raise exception 'asserção falhou: authenticated perdeu save_training_plan';
  end if;
end
$$;
