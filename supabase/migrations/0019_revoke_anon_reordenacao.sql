-- Complemento do B1 (review do PR #54): o checklist da 0018 no staging provou
-- que `revoke ... from public` NÃO corta `anon` — os default privileges do
-- Supabase concedem EXECUTE diretamente a anon/authenticated/service_role na
-- criação de qualquer função. (As RPCs antigas da casa têm o mesmo grant a
-- anon; todas validam auth.uid() na primeira linha, então é defesa em
-- profundidade — follow-up de hardening geral fica fora deste PR.)

revoke all on function public.reorder_planned_exercises(uuid, uuid[]) from anon;
revoke all on function public.reorder_week_sessions(uuid, int, uuid[], boolean) from anon;
revoke all on function public._forca_dia_label(date) from anon;
