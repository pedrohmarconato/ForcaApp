---
phase: 13-push-notification-ponta-a-ponta
fixed_at: 2026-08-15T13:30:00Z
review_path: .planning/phases/13-push-notification-ponta-a-ponta/13-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-08-15T13:30:00Z
**Source review:** .planning/phases/13-push-notification-ponta-a-ponta/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning): 5
- Fixed: 5
- Skipped: 0

Escopo `critical_warning`: CR-01 + WR-01..WR-04 foram atacados. IN-01 (info)
ficou de fora por decisão de escopo do fix_scope, não por falha — nenhum
achado foi descartado por dificuldade.

**Isolamento:** todo o trabalho (edição + commits por achado) rodou num git
worktree isolado (`workflow.use_worktrees` não estava setado em
`.planning/config.json`, então o default `true` se aplicou) em
`/tmp/sv-13-reviewfix-*`, numa branch temporária `gsd-reviewfix/13-*` a
partir de `main`. `node_modules` e `.venv` foram symlinkados de volta ao
checkout principal (somente leitura, nunca alvo de `rm -rf`) para permitir
rodar pytest/jest/tsc de verdade dentro do worktree, ponto a ponto por
achado. Os números finais abaixo (pytest 676, jest 1805/159, tsc 0 erros)
também foram medidos ali, no mesmo working tree onde os commits foram
criados — reproduzíveis fazendo checkout de `main` após o fast-forward do
cleanup tail.

## Fixed Issues

### CR-01: Exceção ao marcar `reminder_sent_at` de UM aluno abortava o resto do tick

**Files modified:** `backend/services/push_reminder_scheduler.py`, `backend/tests/test_push_reminder_scheduler.py`
**Commit:** `b7f662b`
**Applied fix:** As duas chamadas de `_marcar_lembrete_enviado` dentro do
`for sessao in candidatos:` (ramo "sem subscription", linha ~148, e o
ramo pós-loop de push, linha ~190) agora estão envolvidas em
`try/except Exception: logger.exception(...)`, no mesmo espírito de
tolerância a falha já aplicado a `enviar_push`/`delete_subscription`
alguns blocos acima. Uma falha ao marcar a sessão de um aluno agora só
pula aquele aluno (que será reprocessado no próximo tick dentro da mesma
hora, se houver) — não aborta mais o `for` inteiro e não deixa os alunos
seguintes sem NENHUMA tentativa naquele tick.
**Teste-antes-do-fix:** dois testes novos (`test_excecao_ao_marcar_reminder_sent_at_de_um_aluno_sem_subscription_nao_aborta_os_demais` e `test_excecao_ao_marcar_reminder_sent_at_apos_envio_de_push_nao_aborta_os_demais`) reproduzem a exceção via um `raise_on_patch_for` no fake de PostgREST e provam FALHA contra o código antigo (`sess-2` nunca era processada) antes do fix ser aplicado; após o fix, os dois passam e `sess-2` é processada mesmo com `sess-1` falhando ao marcar.

### WR-01: `notifState` nunca virava `'subscribing'` — guard do botão era código morto

**Files modified:** `src/screens/ProfileScreen.tsx`, `__tests__/profileScreen.push.test.tsx`
**Commit:** `8fe5eef`
**Applied fix:** `onAtivarNotificacoes` agora chama `setNotifState('subscribing')`
como a segunda expressão do handler — depois de `subscribeToPush()` continuar
sendo a primeira expressão síncrona (preserva o Critério 2/gesto iOS) — e o
`catch` agora volta explicitamente para `'default'` (além de `setNotifError(true)`)
em qualquer falha que não seja `Notification.permission === 'denied'`, para o
botão não ficar permanentemente desabilitado depois de uma falha de rede, por
exemplo.
**Teste-antes-do-fix (RTL):** novo teste usa uma Promise controlada
manualmente para deixar `subscribeToPush()` "em voo" e assertar
`toBeDisabled()` no botão "Ativar notificações" nesse meio-tempo — falhava
contra o código antigo (botão nunca desabilitava), passa depois do fix.

### WR-02: `push_invite_shown` não era escopada por usuário — segunda conta no mesmo navegador nunca via o convite

**Files modified:** `src/components/PushInviteHost.tsx`, `__tests__/pushInviteHost.test.tsx`
**Commit:** `b25e4df`
**Applied fix:** a chave do AsyncStorage passou de `'push_invite_shown'`
fixa para `` `push_invite_shown:${user.id}` ``, calculada dentro do
`useEffect` (que já tem `user.id` no array de dependências). Os testes
existentes que liam/gravavam a chave fixa (Testes 2, 5 e 6) foram
atualizados para o novo formato escopado — sem isso ficariam
inconsistentes com a implementação nova, não porque o comportamento deles
mudou.
**Teste-antes-do-fix:** novo teste simula a conta A (`user-1`) recusando o
convite e depois a conta B (`user-2`, ID diferente) logando no MESMO
`AsyncStorage` — falhava contra o código antigo (`showAlert` nunca era
chamado para B), passa depois do fix.

### WR-03: Nenhum teste exercitava a RLS real de `push_subscriptions`

**Files modified:** `backend/tests/test_migration_push_subscriptions.py` (novo)
**Commit:** `e49d77a`
**Applied fix:** adicionado teste ESTRUTURAL (parsing de texto da migration
0038, mesmo molde de `test_migration_anamnese_cardio.py`) que confere: RLS
habilitada na tabela; a policy cobre `for all` com AMBAS `using (auth.uid()
= user_id)` e `with check (auth.uid() = user_id)` — a cláusula `with check`
é a parte mais subtil, porque é ela (não a `using`) que barra o upsert
`on_conflict=endpoint` de reescrever a linha de outro usuário; GRANT
explícito de select/insert/UPDATE/delete para `authenticated` com `revoke`
de `public, anon`; o bloco de asserção final `do $$ ... raise exception`
confere a policy e os três GRANTs DML; `endpoint` é `unique` (pré-requisito
estrutural do `on_conflict=endpoint`).
**Verificação por mutação:** antes de commitar, removi manualmente a
cláusula `with check` de uma cópia temporária da migration e confirmei que
o teste NOVO falha exatamente nesse ponto (prova que ele não é
vacuamente verdadeiro) — depois restaurei o arquivo original (`git diff`
limpo na migration).
**LIMITAÇÃO EXPLÍCITA — não finge cobertura:** esta máquina não tem um
daemon Docker rodando (`docker info` falha) nem uma instância
Supabase/Postgres local no ar — subir uma (`supabase start`/`docker
compose up`) ficou fora do escopo deste fix. O teste estrutural acima NÃO
substitui o teste fim-a-fim que o achado original pede: (1) INSERT como
usuário A, (2) `SELECT`/`UPDATE`/`DELETE` da mesma linha como usuário B
assertando 0 linhas afetadas/visíveis, e (3) upsert
`on_conflict=endpoint` como usuário B contra o `endpoint` de A assertando
rejeição em vez de reatribuição silenciosa da linha para B. **Isso fica
pendente de UAT/staging** — recomendo rodar esse cenário contra o projeto
Supabase de staging (mjdjtiujhwklchalquhc, já citado na migration) antes
de considerar o WR-03 integralmente fechado.

### WR-04: `POST /api/push/subscribe` sem teto de tamanho em `endpoint`/`p256dh`/`auth_key`

**Files modified:** `backend/app.py`, `backend/tests/test_push_subscribe.py`
**Commit:** `dc22bef`
**Applied fix:** nova constante `MAX_PUSH_SUBSCRIPTION_FIELD_BYTES = 2 * 1024`
(2 KB combinado, mesmo padrão de `MAX_QUESTIONNAIRE_JSON_BYTES`/
`MAX_DIRETRIZES_JSON_BYTES` já usado no arquivo) e uma checagem logo após a
validação de "campos presentes e não vazios": soma o tamanho em bytes UTF-8
de `endpoint + p256dh + auth_key` e retorna 400 (`"Campos de subscription
excedem o limite de tamanho."`) se ultrapassar o teto — antes de chegar em
`endpoint_e_permitido()`/`upsert_subscription()`.
**Teste-antes-do-fix:** dois testes novos (`p256dh` gigante e `endpoint`
gigante, ambos abaixo do `MAX_CONTENT_LENGTH` global de propósito, para
provar que é o teto NOVO por campo que rejeita, não o global) falhavam
contra o código antigo (201 em vez de 400); um terceiro teste de regressão
negativa prova que campos no tamanho real de produção (endpoint ~100
chars, p256dh 87 chars, auth 22 chars — contrato do W3C Push API)
continuam sendo aceitos após o fix.

## Skipped Issues

Nenhum — todos os 5 achados em escopo (`critical_warning`) foram corrigidos.

## Gates finais (medidos no worktree isolado, mesmo tree dos commits acima)

| Gate | Resultado |
|---|---|
| `pytest backend/` | **676 passed**, 0 failed |
| `jest` (suíte completa) | **1805 passed** / 159 suítes, 0 failed |
| `tsc --noEmit` | **0 erros** |

## Pendência explícita para o dono (não decidida em silêncio)

- **WR-03 — RLS viva**: cobertura estrutural (parsing de SQL) está no
  lugar e comprovadamente sensível à regressão que o achado descreve (via
  teste de mutação manual), mas o cenário fim-a-fim contra Postgres real
  (usuário B não consegue ler/sobrescrever a linha de A, nem via upsert
  `on_conflict=endpoint`) ainda não foi exercitado nesta máquina por falta
  de um Postgres/Supabase local disponível. Recomendo validar isso contra
  staging antes do merge, ou decidir explicitamente aceitar o risco
  residual até lá.

---

_Fixed: 2026-08-15T13:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
