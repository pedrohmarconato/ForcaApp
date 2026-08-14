# Painel adversarial pré-push — Fase 5 (diff origin/main..HEAD)

**Alvo:** `origin/main..HEAD` — 55 commits, 117 arquivos (+10.029/−743), baseline `0193742`,
contador origin/main..HEAD = 55 no início da Task 1 (prova de nenhum-push: só pode crescer).
**Revisores:** revisor-seguranca, revisor-integridade, revisor-regressao, revisor-contrato
(4 em paralelo, mandatos estreitos, só leitura). Achado de severidade alta reconfirmado pela
linha principal abrindo o código citado.

## Bottom-line

O painel confirmou **7 achados** (1 alta, 4 médias, 2 baixas) — todos na fila offline-first e
no encanamento de dados do gráfico novo; segurança e contrato passaram limpos (0 achados em
ambos, incluindo os 20 itens verificáveis de REQ-06/REQ-07/INT-01).

## Achados CONFIRMADOS

| # | Severidade | Achado | Prova (file:linha) | Cenário de falha | Revisor | Resolução |
|---|---|---|---|---|---|---|
| 1 | **ALTA** | Falha transitória do AsyncStorage no `enqueueItem` perde a mutação (série/skip/swap/finish) silenciosamente e para sempre: os dois ramos de falha devolvem documento só-em-memória (`skipSave: true` no loadFailed; `lastKnownDoc` no catch de escrita), `enqueueAndDrain` não repassa esse doc ao `drainAll` — que relê o disco de forma independente e nunca vê o item — e `applyServerSetLogs` preserva o estado local `'done'` na retomada sem reenfileirar. Sem retry, sem quarentena, sem aviso, sem cobertura de teste para o gap. Viola D-07 da própria fila. | `src/services/sessionOutboxDrain.ts:478-499`, `:619-627`; `src/services/sessionOutboxStorage.ts:92-117`; `src/store/activeSessionStore.ts:1293-1308`, `:341-342` | Aluno completa série no exato instante de um hiccup do AsyncStorage (ex.: contenção SQLite no Android) → série marcada `'done'` localmente, `save_set_log` nunca enviado, servidor nunca vê o registro; na retomada nada detecta a divergência. | integridade (reconfirmado pela linha principal) | corrigido-com-teste |
| 2 | MÉDIA | Quarentena invisível: `quarantineCount` existe no estado mas nenhuma UI o renderiza; item rejeitado em definitivo (23505/42501/22023/22004/P0002 ou WR-02) sai da fila sem reverter o estado otimista já aplicado e sem qualquer aviso ao aluno. `DrainCallbacks` não expõe callback por item quarentenado. | `src/services/sessionOutboxDrain.ts:88-93`; `src/store/activeSessionStore.ts:1503-1505,1792`; `src/screens/ActiveSessionScreen.tsx:401-406` | Swap/skip/save/finish rejeitado em definitivo (ex.: corrida entre dois devices) → draft local segue mostrando a ação como aplicada; nada na tela avisa que ela nunca chegou ao servidor. | integridade | corrigido-com-teste |
| 3 | MÉDIA | Drift de errcode até a 0037 subir: o cliente (`DEFINITIVE_CODES`) só reconhece `23505`, mas produção (0036) ainda emite `P0005` mascarado pelo PostgREST como 500 sem `.code` → recusa definitiva de swap vira retry por até 7 dias e bloqueia a cabeça da sub-fila FIFO da sessão. Alcance prático hoje limitado a corrida multi-device (guard client-side já impede o caso local). Risco é de **sequenciamento de deploy**, não de conteúdo da migration. | `src/engine/sessionOutboxPolicy.ts:127-140`; `src/engine/config.ts:136-141`; `supabase/migrations/0037_swap_guard_codigo_oficial.sql:1-65` | Código chega em produção (Fase 8) sem a 0037 aplicada (Fase 7) → quarentena pretendida degrada para retry inútil de dias. | integridade | aceito-pelo-dono: mitigado pelo sequenciamento do milestone — Fase 7 aplica a 0037 em staging e produção antes do deploy web da Fase 8; risco residual limitado a corrida multi-device na janela entre push e migration (2026-08-14) |
| 4 | MÉDIA | Gráfico de evolução agrupa série trocada na modalidade errada: `getCardioLogs` deriva identidade de `planned_exercises` sem corrigir por `cardio_exercise_swaps` (o Histórico já corrige via `swappedFrom`); o `CardioEvolucaoChart` novo herda a fonte errada. | `src/services/cardioGoalRepository.ts:46-63`; `src/services/sessionExecutionRepository.ts:940-965`; `src/components/progress/CardioEvolucaoChart.tsx:25,88,106` | Aluno troca Caminhada→Corrida e completa a série → Histórico mostra "Corrida (trocado de Caminhada)"; o gráfico novo agrupa o mesmo ponto sob "Caminhada", misturando modalidades na série de evolução. | integridade | corrigido-com-teste |
| 5 | MÉDIA | `reset()` zera `pendingCount`/`quarantineCount` incondicionalmente ao montar nova sessão e nada resincroniza contra a fila real do usuário — o chip "N registros a caminho" some no treino B mesmo com itens do treino A pendentes (a fila é do usuário, não da tela — D-10). | `src/store/activeSessionStore.ts:1776-1793`; `src/screens/ActiveSessionScreen.tsx:210,396-403`; `src/hooks/useSessionOutboxDrain.ts:13-31` | Wifi ruim no fim do treino A → aluno entra no treino B → selo de pendência invisível até a próxima mutação ou AppState active. | regressão | corrigido-com-teste |
| 6 | BAIXA | Drenagem fire-and-forget sem flag de relevância: promessa antiga de `drainAll` resolvendo após troca de `userId` escreve contadores no store do usuário novo (pisca contagem residual; autocorretivo no ciclo seguinte). | `src/hooks/useSessionOutboxDrain.ts:16-30` | Troca rápida de conta no mesmo aparelho → selo do usuário novo pisca com contagem do antigo até o próximo drain. | regressão | aceito-pelo-dono: autocorretivo no ciclo seguinte de drain; severidade baixa (2026-08-14) |
| 7 | BAIXA (informativo) | Fetch duplicado: `ProgressScreen.carregar()` e `CardioEvolucaoChart` chamam `getCardioLogs(user.id)` de forma independente a cada abertura da aba — ineficiência, sem corrupção de estado (cada um tem descarte de resposta obsoleta próprio). | `src/screens/ProgressScreen.tsx:100`; `src/components/progress/CardioEvolucaoChart.tsx:88` | Duas chamadas de rede idênticas por abertura da aba Progresso. | regressão | aceito-pelo-dono: ineficiência sem corrupção de estado; otimização fica para ciclo futuro (2026-08-14) |

## Descartado na consolidação (especulativo — não entra como achado)

- Aviso "A worker process has failed to exit gracefully" em UMA execução de jest no branch
  (ausente em origin/main): não reproduzível em novas execuções, nem com `--detectOpenHandles`;
  handle específico não localizado. Registrado como "não deu para provar".

## O que NÃO foi encontrado (varredura limpa, com verificação explícita)

- **Segurança (0 achados):** nenhum segredo commitado (JWT em teste de integração é a chave demo
  pública do `supabase start`; service_role só via env com trava de loopback); nenhuma PII real
  (fixtures 100% sintéticas); migration 0037 mantém `revoke` de public/anon e `grant execute` só
  para authenticated; RPCs com parâmetros nomeados, sem superfície de injeção; logs sem payload
  de usuário; refs de projeto Supabase são públicas, sem chave junto; 87 docs de .planning sem
  vazamento.
- **Contrato (0 achados):** 20/20 itens verificáveis entregues — REQ-06 (4/4), REQ-07 (10/10,
  incluindo as 6 operações da fila confirmadas uma a uma no código vivo), INT-01 (6/6, commit
  `f61a45a` com exatamente 4 arquivos); nenhum extra não pedido (OUTBOX_CONFIG e 0037 são
  exigência direta dos requisitos); nenhuma dependência nova.
- **Regressão (limpo fora dos achados acima):** todos os exports movidos de `activeSessionStore`
  para `sessionOutboxDrain` sem chamador órfão; automock novo de AsyncStorage sem conflito com os
  ~15 mocks explícitos; inserção do `<CardioEvolucaoChart />` sem dano a vizinhos nem alcance
  global de layout; `23505` não colide com `save_set_log` (upsert `ON CONFLICT`, nunca lança
  23505); suíte 147/147, tsc 0 erros.
- **Integridade (limpo fora dos achados acima):** CR-01 fechado com teste dedicado; WR-01 sem
  estado final incorreto em corrida entre call-sites; "sem amostra é —, nunca 0" cumprido no
  motor novo; mecanismo da migration 0037 coerente (create or replace + guarda de asserção).

## Baseline anti-push (D-06)

- `git rev-parse origin/main` = `0193742e5c653ce3bbb2a7aa98d657a8a54118d6`
- `git rev-list --count origin/main..HEAD` = **55** (início da Task 1) — reconferir ≥ 55 ao fim da Task 3.

## Resolução (Task 3, decisão do dono capturada em 2026-08-14)

Decisão do dono por achado (checkpoint da Task 2): corrigir 1, 2, 4 e 5; aceitar 3, 6 e 7.
Expansão de escopo autorizada para os arquivos citados nas provas dos achados 1/2/4/5 (D-01 do
plano cobria só os 4 arquivos do gráfico de cardio).

Cada achado corrigido seguiu teste-antes-do-fix (RED confirmado antes da correção, GREEN depois,
`npx tsc --noEmit` 0 erros e suíte completa verde antes do commit de cada correção):

| # | Commit teste (RED) | Commit fix (GREEN) | Arquivos tocados |
|---|---|---|---|
| 1 | `test(05): reproduz achado 1 — enqueue perde mutação em hiccup transitório de escrita` | `fix(05): retenta enqueue da fila offline-first em hiccup transitório de AsyncStorage` | `src/services/sessionOutboxDrain.ts` |
| 4 | `test(05): reproduz achado 4 — getCardioLogs ignora troca de modalidade de cardio` | `fix(05): corrige identidade do gráfico de cardio por troca de modalidade` | `src/services/cardioGoalRepository.ts` |
| 5 | `test(05): reproduz achado 5 — reset() zera selo de pendência sem resync` | `fix(05): reset() resincroniza selo de pendência contra a fila real (D-10)` | `src/store/activeSessionStore.ts`, `src/screens/ActiveSessionScreen.tsx` |
| 2 | `test(05): reproduz achado 2 — quarentena da fila fica invisível na tela` | `fix(05): torna quarentena da fila offline-first visível na tela de sessão` | `src/screens/ActiveSessionScreen.tsx` |

Achados 3, 6 e 7 foram aceitos pelo dono com justificativa registrada na coluna `Resolução` da
tabela acima — nenhuma mudança de código para eles nesta fase.

Verificação local final (após o último fix, antes deste commit de docs): `npx tsc --noEmit`
0 erros; suíte jest completa **147/147 suites, 1692/1692 testes** verdes (4 testes novos: um por
achado corrigido). Nenhum `git push` foi executado — ver reconferência da contagem
`origin/main..HEAD` no SUMMARY.md desta plan.
