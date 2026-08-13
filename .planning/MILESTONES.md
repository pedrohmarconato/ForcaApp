# Milestones

## v1.0 Cardio e alongamento (Shipped: 2026-08-13)

**Phases completed:** 4 phases, 19 plans, 28 tasks
**Stats:** 126 commits, 183 arquivos, +26.702/−1.603 linhas (a25f955 → 8cfd8bc + fechamento), 2026-08-08 → 2026-08-13 (6 dias)
**Closeout:** override_closeout — Known verification overrides: 1 (see STATE.md Deferred Items)
**Audit:** `.planning/milestones/v1.0-MILESTONE-AUDIT.md` — requisitos 7/7, fases 4/4 verificadas, integração 6/6, E2E completo, status final `tech_debt`

**Key accomplishments:**

- **Registro decimal de cardio (REQ-01):** distância aceita e exibe vírgula pt-BR ("2,4 km") via `formatDistance` em `ManualExerciseRow`; persistência decimal confirmada por teste de regressão.
- **Meta de cardio com fonte única (REQ-02):** `CardioPrescritoSection` substituiu `CardioGoalsSection` na aba Progresso — prescrito × realizado derivado direto de `planned_sets` do plano ativo (`cardioPrescrito.ts`), sem UI de meta manual e sem migration.
- **Alongamento guiado pilotável pelo chat (REQ-03):** catálogo de Mobilidade expandido de 4 para 10 exercícios nomeados por grupo muscular e item 8 de `_INSTRUCOES_MOLDE` prioriza esses nomes quando `diretrizes.preferencias` pede foco — checkpoint humano aprovado em geração real no HML (2026-08-09).
- **Anamnese e calibração de cardio (REQ-04/05):** 3 perguntas de anamnese chegam comprovadamente ao prompt (migration 0033 aplicada em staging e produção em 2026-08-09) e o bloco CALIBRAÇÃO DE CARDIO ajusta dose inicial e teto de progressão por nível declarado.
- **Troca de modalidade com guarda no servidor (REQ-06):** `swap_session_exercise` + `cardio_exercise_swaps` (migrations 0034→0036 aplicadas em homologação E produção em 2026-08-10); troca preserva duração-alvo, guarda P0005 recusa troca após série concluída, histórico mostra "Trocado de X" e o realizado soma qualquer modalidade (provado em UAT: 45/90 min, 7/15 km com 2 modalidades na semana).
- **Execução de treino offline-first (REQ-07):** outbox durável para as 6 operações de execução (completeSet, adaptação, skip/unskip/swap/finish) com retry por idade, dedupe por chave natural e quarentena de recusa definitiva — provado em 3 níveis (unitário, Postgres real, UAT modo avião); a prova real pegou o P0005 mascarado pelo PostgREST e originou a migration 0037 (23505).

**Known gaps / deferred (detalhe em STATE.md e no audit):**

- Migration 0037 (P0005→23505) aplicada só no stack local — deploy em staging/produção pende do fluxo normal (ação do dono).
- Teste 8(c) do 03-UAT.md: reconfirmação de "fechar e reabrir o app" em build nativo iOS/Android — deferido (máquina do ciclo sem toolchain nativa).
- Sessão de debug `typeerror-envio-series-treino` em `resolved_partial` — fix commitado e verificado; falta o texto literal do erro de produção (só o dono tem) e a ressalva do `errMsg` sem nome de classe.
- Migrations sem GRANT DML de tabela para `authenticated` (projeto Supabase novo sobe quebrado); `Alert.alert` no-op no react-native-web trava "Concluir treino" com séries pendentes no alvo web; tabela `cardio_goals` órfã; Nyquist not-validated nas 4 fases.

---
