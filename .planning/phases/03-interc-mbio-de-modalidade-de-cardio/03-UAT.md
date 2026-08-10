---
status: testing
phase: 03-interc-mbio-de-modalidade-de-cardio
source: [03-VERIFICATION.md]
started: 2026-08-10T14:01:28Z
updated: 2026-08-10T18:45:00Z
round: 2
round_note: |
  Rodada 1 (testes 1–5) foi executada em 2026-08-10 contra Postgres real e produziu os dois
  gaps registrados no fim deste arquivo. A onda de gap closure (planos 03-07/03-08/03-09)
  fechou o CÓDIGO dos dois; a re-verificação (03-VERIFICATION.md, 6/8 must-haves) devolveu
  `human_needed` com 3 itens, que entram aqui como testes 6, 7 e 8. Os enunciados e
  resultados dos testes 1–5 ficam preservados exatamente como estavam — os planos e o
  ROADMAP citam "teste 3" e "teste 5" por número.
environment: |
  Execução assistida por agente, a pedido do dono, contra Postgres REAL — não homologação.
  Stack Supabase local (OrbStack/Docker), migrations 0000→0035 aplicadas (36/36), RPC
  swap_session_exercise e tabela cardio_exercise_swaps presentes. App via Expo web em
  localhost:8081. Usuário semeado: uat-cardio@forca.test.
  DIVERGÊNCIA DE AMBIENTE REGISTRADA: as migrations concedem `execute` em 58 funções, mas
  nenhum `grant select/insert/update/delete` em tabela para o papel `authenticated`.
  Homologação e produção funcionam por terem sido criadas sob o comportamento legado do
  Supabase, que expunha tabelas novas automaticamente; o padrão atual não expõe (ver
  supabase/config.toml:19-24). Foi preciso conceder DML no banco local para o app subir.
  Um projeto Supabase NOVO criado a partir destas migrations sobe quebrado com
  "permission denied for table planned_sessions". Nenhuma alteração foi feita no repo.
---

## Current Test

number: 7
name: Aplicar a migration 0036 em staging e produção e confirmar a recusa P0005 contra a RPC real
expected: |
  Depois de rodar o runbook de 03-08-SUMMARY.md em cada ambiente, registrar um set_log para um
  exercício de cardio e chamar swap_session_exercise diretamente para o mesmo
  planned_exercise_id resulta em recusa com errcode P0005, em vez de gravar em
  cardio_exercise_swaps — em staging E em produção.
awaiting: user response

## Tests

### 1. Trocar modalidade pela fila da sessão, contra o servidor real
expected: O botão "Trocar modalidade" aparece no exercício de cardio da fila; a lista traz só as modalidades aceitas, sem a atual; confirmar grava no servidor (RPC `swap_session_exercise`, tabela `cardio_exercise_swaps`); fechar e reabrir o app mantém a troca.
result: pass
source: execução assistida (agente) contra Postgres real
evidence: |
  Ambiente: Supabase local (OrbStack/Docker), migrations 0000→0035 aplicadas (36/36),
  RPC `swap_session_exercise` e tabela `cardio_exercise_swaps` presentes. App via Expo web
  em localhost:8081, usuário semeado uat-cardio@forca.test.
  - Fila renderizou "01 Corrida / 30 min · 5 km / Não vou fazer / Trocar modalidade";
    testID `swap-00000000-0000-4000-8000-000000000004` confirmado.
  - Sheet abriu com título "Trocar Corrida" (kicker "CARDIO"); opções literais:
    "Caminhada" e "Bicicleta Ergométrica". "Corrida" (a atual) NÃO aparece.
  - Após confirmar: fila mostrou "01 Caminhada / Trocado de Corrida. / S1 alvo 30:00".
  - Persistência conferida no banco: cardio_exercise_swaps → to_modality="Caminhada",
    exercício original "Corrida", com set_logs=0 (prova que a fila reconstruída após
    reload veio do servidor, não de cache local).
  - Reload da página manteve "01 Caminhada / Trocado de Corrida.".
caveat: |
  "Fechar e reabrir o app" foi exercitado como reload da página no alvo web, não como
  encerramento de processo em build nativa iOS/Android.

### 2. Trocar modalidade pelo fluxo de recusa (`sem_equipamento`)
expected: Ao escolher o motivo "sem equipamento" num exercício de cardio, o sheet oferece "Trocar modalidade" ao lado de "Recusar mesmo assim"; escolher trocar abre o MESMO seletor do teste 1 e persiste igual. Escolher "Recusar mesmo assim" continua se comportando exatamente como o "Não vou fazer" de hoje.
result: pass
source: execução assistida (agente) contra Postgres real
evidence: |
  - Sheet de recusa listou os motivos: "Sem tempo hoje, Dor ou lesão, Equipamento
    indisponível, Não gosto deste exercício, Cansaço, Outro motivo".
  - Ao selecionar "Equipamento indisponível", surgiu o botão "Trocar modalidade"
    (testID `skip-reason-oferecer-troca`) e o botão de confirmação mudou o texto
    para "Recusar mesmo assim" (testID `skip-reason-confirm`).
  - Clicar em "Trocar modalidade" abriu o MESMO seletor do teste 1: título
    "Trocar Caminhada" (kicker CARDIO), opções "Corrida" e "Bicicleta Ergométrica";
    a modalidade atual ("Caminhada") não aparece na lista.
caveat: |
  A equivalência de "Recusar mesmo assim" com o "Não vou fazer" anterior NÃO foi
  exercitada manualmente (a recusa não foi confirmada, para não destruir o cenário).
  Repousa nos 22 testes automatizados de regressão em recusaDeclarada.test.ts e
  recusaDeclaradaFluxo.test.ts.

### 3. Rótulo "Trocado de X" na sessão ativa e no histórico
expected: Depois da troca, a sessão ativa mostra "Trocado de X" no exercício; ao concluir a sessão, o detalhe no histórico mostra o mesmo rótulo E o resultado do cardio legível (tempo/distância) — este último era um bug pré-existente que a Fase 3 consertou.
result: issue
reported: "Detalhe do histórico não abre: 'Não foi possível carregar este treino. Verifique a conexão e tente novamente.' A metade da sessão ativa funciona (rótulo 'Trocado de Corrida.' visível), mas o histórico — que é a metade que a Fase 3 se propôs a consertar — está quebrado."
severity: blocker
evidence: |
  Metade que PASSOU — sessão ativa: fila mostrou "01 Caminhada / Trocado de Corrida. /
  S1 ✓ 25:00 · 4 km · 6:15 /km · abaixo". Rótulo e resultado de cardio corretos.

  Metade que FALHOU — detalhe do histórico: a tela exibe "Não foi possível carregar
  este treino. Verifique a conexão e tente novamente."

  Causa raiz CONFIRMADA (não é falta de backend Flask — a tela usa Supabase):
  `src/screens/SessionHistoryDetailScreen.tsx:54` chama `getSessionLogDetail`, que em
  `src/services/sessionExecutionRepository.ts:891` faz:
    planned_sets(set_order, planned_exercise_id, planned_exercises(...))
  A tabela `planned_sets` NÃO tem a coluna `planned_exercise_id` — suas colunas são
  id, exercise_id, set_order, target_reps_min, target_reps_max, target_load_kg,
  target_rir, created_at, target_duration_seconds, target_distance_m. Nenhuma migration
  (0000→0035) cria `planned_exercise_id` nessa tabela.

  Reproduzido direto no PostgREST, autenticado, contra o Postgres real:
    {"code":"42703","message":"column planned_sets_1.planned_exercise_id does not exist"}
  A consulta de cabeçalho responde normalmente; é a segunda consulta (set_logs) que
  estoura. `linhas.error` é lançado em sessionExecutionRepository.ts:894 sem degradação —
  a proteção `erroDeColunaAusente` existe só para a consulta de cabeçalho (linha 882).

  Alcance: quebra o detalhe de QUALQUER sessão com séries registradas, trocada ou não.

  Introduzido pela própria Fase 03 — commit 55aab43 "feat(03-05): estende
  getSessionLogDetail p/ cardio + swappedFrom (D-08 histórico)". O select anterior
  não pedia `planned_exercise_id` e funcionava.

  Por que os testes não pegaram: sessionExecutionRepository.test.ts mocka o cliente
  supabase, então o nome errado de coluna nunca chega ao PostgREST. Os 27 testes de
  swap passam com a consulta quebrada.

### 4. Km realizado na aba Progresso após uma troca
expected: O km realizado da semana soma a distância da modalidade trocada junto com as demais, num total único; o km PRESCRITO permanece cheio, sem desconto pela sessão trocada.
result: pass
source: execução assistida (agente) contra Postgres real
evidence: |
  Aba Progresso, seção "Cardio desta semana" ("Prescrito: 30 min no total"), texto literal:
    "25 de 30 min" | "4 de 5 km" | "1 de 1 dia com cardio"
  Os 4 km realizados vieram da modalidade TROCADA (Caminhada, série de 25 min / 4 km);
  o prescrito permaneceu cheio em 5 km, sem desconto pela troca — que é exatamente a
  afirmação sob teste.
caveat: |
  Com um único exercício de cardio na semana, a soma de MÚLTIPLAS modalidades diferentes
  num total único não foi exercitada manualmente. Essa metade repousa nos testes
  automatizados cardioGoals.test.ts:316 e cardioPrescrito.test.ts:117.

### 5. Troca bloqueada depois de série concluída (CR-01, contra o servidor real)
expected: Registrar uma série do exercício de cardio e então tentar trocar a modalidade: o app recusa com a mensagem "Não é possível trocar a modalidade depois de uma série concluída" e NADA é gravado no servidor. O histórico da série já feita continua sob a modalidade em que foi realmente executada.
result: pass
source: execução assistida (agente) contra Postgres real
evidence: |
  Série concluída pela UI: campos "Minutos"=25, "Distância (km)"=4, PACE calculado
  "6:15 /km", botão "Concluir série". Fila passou a mostrar
  "S1 ✓ 25:00 · 4 km · 6:15 /km · abaixo".
  Ao tentar trocar em seguida (selecionar "Corrida" e confirmar), apareceu o toast com
  o texto EXATO esperado:
    "Não é possível trocar a modalidade depois de uma série concluída."
  A troca não foi aceita; a fila permaneceu em "Caminhada" com o resultado intacto.
caveat: |
  UX: o botão "Trocar modalidade" CONTINUA visível após a série concluída e o seletor
  ABRE normalmente, sem aviso — a recusa só aparece ao confirmar. Interação sem saída,
  não é falha do critério.
server_gap: |
  A cláusula "NADA é gravado no servidor" vale para o caminho do app, NÃO para o servidor.
  Verificado por comportamento contra a RPC real: com uma série `on_target` (1500 s,
  4200 m) gravada em `set_logs` para o exercício de cardio, a chamada direta a
  `swap_session_exercise` foi ACEITA e gravou em `cardio_exercise_swaps`.
  `pg_get_functiondef` da função instalada não menciona `set_logs` — a guarda CR-01
  existe só em `src/store/activeSessionStore.ts:1513-1521`, no cliente.
  Consequência: chamada direta, segundo dispositivo, ou app sem a guarda gravam a troca,
  e a série já executada como Corrida passa a ser exibida sob a modalidade nova —
  contrariando a última frase do critério deste teste.
  A 03-VERIFICATION.md já registrava isso como "risco residual aceito, não gap"; aqui
  fica registrado como comprovado, não como suposição.

### 6. Harness de integração do G-03-3 contra Postgres real (rodada 2)
expected: Com o stack Supabase local de pé (`supabase start`), `npm run test:integration:pg` passa 1/1 — `getSessionLogDetail` devolve o detalhe da sessão sem lançar erro `.code === '42703'`.
result: [pending]
source: 03-VERIFICATION.md — Human Verification item 1
why_human: |
  O 03-07-SUMMARY.md relata ter feito exatamente isso (RED com 42703 confirmado, depois
  GREEN), mas o gsd-verifier encontrou o stack local PARADO (`supabase status` → "Stopped
  services") e não subiu/semeou o stack: mutaria estado local fora do escopo de uma
  verificação read-only e podia colidir com outra sessão paralela no mesmo clone.
  Risco residual avaliado como BAIXO — `exercise_id` é coluna da migration 0001, a mais
  antiga do domínio de treino, presente em qualquer ambiente que tenha as migrations de
  cardio; não há cenário de drift plausível que o RED/GREEN relatado não teria pego.

### 7. Migration 0036 aplicada em staging e produção, com recusa P0005 comprovada (rodada 2)
expected: |
  Rodar o runbook de 03-08-SUMMARY.md (`scripts/supabase-preflight.sh hml && supabase db push`,
  depois `prod` com confirmação `PRODUCAO`) e então repetir o teste 5 deste arquivo contra cada
  ambiente: a chamada direta a `swap_session_exercise` com `set_log` já gravado é recusada com
  `errcode = 'P0005'`, em vez de gravar em `cardio_exercise_swaps`.
result: [pending]
source: 03-VERIFICATION.md — Human Verification item 2
why_human: |
  AGENTS.md (linhas 48-49, conferido em 10/08/2026) confirma que só 0000→0035 estão aplicadas
  em staging (mjdjtiujhwklchalquhc) e produção (zanqygwsgxkyjiuhrzju). Aplicar migration a
  banco vivo é ação exclusiva do dono; nenhum agente deste fluxo está autorizado.
  O dono decidiu "option-a" (aplicar agora, staging primeiro) no checkpoint do plano 03-08,
  mas os comandos ainda NÃO foram executados.
impacto_enquanto_pendente: |
  O comportamento que o teste 5 desta UAT comprovou explorável continua vivo em staging e
  produção: chamada direta à RPC, build sem o guard client-side, ou corrida entre dois
  dispositivos ainda grava a troca para exercício com série concluída.

### 8. Caveats da rodada 1 ainda não exercitados manualmente (rodada 2)
expected: |
  (a) "Recusar mesmo assim" se comporta identicamente ao antigo "Não vou fazer" quando o aluno
  NÃO escolhe trocar; (b) o km realizado da semana soma corretamente com MÚLTIPLAS modalidades
  diferentes na mesma semana (a rodada 1 só teve uma); (c) o teste 1 ("fechar e reabrir o app")
  se confirma num build nativo iOS/Android real, não só reload de página web.
result: [pending]
source: 03-VERIFICATION.md — Human Verification item 3
why_human: |
  Depende de interação de UI real (build nativo, múltiplos cenários de dados) que nem teste de
  componente isolado nem a execução assistida da rodada 1 (um único exercício de cardio,
  plataforma web) cobrem. Já eram caveats explícitos da rodada 1 — não são gaps novos.
  Cobertura automatizada correspondente: `recusaDeclarada*.test.ts`, `cardioGoals.test.ts:316`,
  `cardioPrescrito.test.ts:117`.

## Summary

total: 8
passed: 4
issues: 1
pending: 3
skipped: 0
blocked: 0

round_1: 5 testes — 4 pass, 1 issue (teste 3, blocker G-03-3)
round_2: 3 testes — todos pending (itens de verificação humana da 03-VERIFICATION.md)

## Gaps

- gap_id: G-03-3
  truth: "O detalhe da sessão no histórico abre e mostra o rótulo 'Trocado de X' com o resultado do cardio legível (tempo/distância)"
  status: resolved
  resolved_by: "Plano 03-07 (commits afb0e2b RED, afb35ab GREEN, e7386c0 SUMMARY) — getSessionLogDetail passa a ler planned_sets.exercise_id (coluna real, migration 0001:91) no select e no consumo das linhas. Harness de integração novo (__tests__/integration/getSessionLogDetail.postgrest.test.ts) fora da suíte padrão, rodável por `npm run test:integration:pg`. Confirmado por leitura direta, 47/47 em sessionExecutionRepository.test.ts, grep de regressão vazio em src/, e revisão independente (03-REVIEW.md item 1)."
  pendencia: "Teste 6 da rodada 2 — reexecutar o harness contra Postgres real. O executor relata RED→GREEN; o gsd-verifier não reproduziu (stack local parado). Risco residual avaliado como baixo."
  reason: "User reported (execução assistida): tela exibe 'Não foi possível carregar este treino. Verifique a conexão e tente novamente.' — PostgREST devolve 42703, column planned_sets_1.planned_exercise_id does not exist"
  severity: blocker
  test: 3
  root_cause: "getSessionLogDetail seleciona `planned_sets(set_order, planned_exercise_id, ...)`, mas planned_sets não tem essa coluna — o nome real é `exercise_id`. Introduzido no commit 55aab43 (plano 03-05); o select anterior não pedia o campo e funcionava. Sem degradação: `erroDeColunaAusente` protege apenas a consulta de cabeçalho (linha 882), não a de set_logs (linha 894)."
  artifacts:
    - path: "src/services/sessionExecutionRepository.ts"
      line: 891
      issue: "select pede planned_sets.planned_exercise_id (inexistente); coluna correta é exercise_id"
    - path: "src/services/sessionExecutionRepository.ts"
      line: 916
      issue: "consumidor lê l?.planned_sets?.planned_exercise_id — precisa acompanhar o rename"
    - path: "__tests__/sessionExecutionRepository.test.ts"
      issue: "mocka o cliente supabase, então nome de coluna inexistente nunca chega ao PostgREST — 27 testes de swap passam com a consulta quebrada"
  missing:
    - "Trocar `planned_exercise_id` por `exercise_id` no select de set_logs (linha 891) e na leitura (linha 916)"
    - "Estender a degradação `erroDeColunaAusente` à consulta de set_logs, ou justificar por que só o cabeçalho a tem"
    - "Adicionar teste que exercite getSessionLogDetail contra PostgREST real (não mock), senão a classe inteira de erro 42703 continua invisível"
  debug_session: ""

- gap_id: G-03-5-servidor
  truth: "Troca de modalidade não é gravada quando já existe série concluída para o exercício"
  status: code_ready_not_applied
  resolved_by: "Plano 03-08 (commits 9276306 migration + harness, 508ec39 decisão + SUMMARY) — supabase/migrations/0036_guarda_set_log_troca_cardio.sql recria swap_session_exercise com guarda que recusa a troca (errcode P0005) quando já existe set_log para o planned_exercise_id alvo, preservando byte a byte a guarda de métrica da 0035 e sua asserção runtime. 8/8 no harness textual; 03-REVIEW.md item 2 confirmou comparação byte a byte."
  decisao_do_dono: "option-a — aplicar agora, staging primeiro (registrada no checkpoint do plano 03-08, 2026-08-10)."
  pendencia: "ABERTO EM PRODUÇÃO HOJE. Teste 7 da rodada 2. AGENTS.md:48-49 confirma que só 0000→0035 estão aplicadas em staging e produção; o `supabase db push` NÃO foi executado. Enquanto isso, o comportamento comprovado no teste 5 continua reproduzível nos dois ambientes. O guard client-side (activeSessionStore.ts:1518) segue protegendo o fluxo normal do app — mesma proteção que já existia antes desta onda."
  reason: "Verificado por comportamento contra a RPC real: com set_log on_target gravado, swap_session_exercise aceitou e persistiu em cardio_exercise_swaps"
  severity: major
  test: 5
  root_cause: "A guarda CR-01 existe só no cliente (src/store/activeSessionStore.ts:1513-1521). pg_get_functiondef de swap_session_exercise (migrations 0034/0035) não menciona set_logs."
  artifacts:
    - path: "supabase/migrations/0035_guarda_metric_troca_cardio.sql"
      issue: "RPC valida auth, modalidade, propriedade do log, finished_at, pertencimento e metric — mas não série já concluída"
  missing:
    - "Decisão do dono: manter como risco residual aceito (status quo da 03-VERIFICATION.md) ou promover a guarda para a RPC numa migration 0036"
  note: "Registrado como gap por ser comprovado, não suposto. NÃO bloqueia o teste 5, que passa pelo caminho do app. A decisão de escopo é do dono."
