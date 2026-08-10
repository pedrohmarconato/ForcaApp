---
status: diagnosed
phase: 03-interc-mbio-de-modalidade-de-cardio
source: [03-VERIFICATION.md]
started: 2026-08-10T14:01:28Z
updated: 2026-08-10T15:35:00Z
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

[testing complete]

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

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-03-3
  truth: "O detalhe da sessão no histórico abre e mostra o rótulo 'Trocado de X' com o resultado do cardio legível (tempo/distância)"
  status: failed
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
  status: failed
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
