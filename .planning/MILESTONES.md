# Milestones

## v1.1 Release em produção (Shipped: 2026-08-14)

**Phases completed:** 4 fases (5-8) — Fase 5 com 2 plans/4 tasks e verificação 11/11;
fases 6-8 executadas direto (sem diretórios de fase), com evidência registrada em
ROADMAP/STATE.
**Stats:** ~25 commits (v1.0 → HEAD), 2026-08-13 → 2026-08-14 (2 dias)
**Closeout:** override_closeout — Known verification overrides: 2 (fases 6-8
completion-by-evidence sem SUMMARY próprio; debug `typeerror-envio-series-treino`
resolved_partial segue deferida — see STATE.md Deferred Items). Sem audit formal de
milestone (decisão registrada: milestone operacional de release com trilha de
evidência direta; auditoria retroativa disponível via /gsd-audit-milestone).

**Key accomplishments:**

- 3 commits locais (chore/docs/feat) integram o gráfico de evolução de cardio (motor + componente + 20 testes + wiring de 4 linhas) já pronto no working tree, com `.claude/` gitignorado antes de qualquer commit e `.planning/reviews/` versionado sem edição — nenhum push, verificação local 100% verde na primeira rodada (tsc 0 erros, 147/147 suites jest, 617 testes pytest).
- Painel adversarial de 4 revisores sobre os 63 commits acumulados de v1.0/v1.1 confirmou 7 achados na fila offline-first e no gráfico de cardio; 4 corrigidos com teste-antes-do-fix (retry em `enqueueItem`, resync do selo de pendência, quarentena visível, identidade correta do gráfico por troca de modalidade), 3 aceitos pelo dono — zero push, fase pronta para a Fase 6.
- **Publicação (Fase 6):** push `0193742..82fd8db` (68 commits) para `origin/main` com CI `session-contract` verde (run 31822228262).
- **Migration 0037 (Fase 7):** P0005→23505 verificada por leitura em staging E produção — errcode 23505 vivo, md5 `662cbd9e07482334228a89dfbd8475ce` idêntico nos dois ambientes, histórico registra a 0037 em ambos.
- **Deploy web (Fase 8):** `vercel deploy --prod` executado pelo dono → https://forca-app-six.vercel.app (200, title "Força"); deviação registrada: preview+smoke pulado por decisão do dono ("manda tudo para prod logo").
- **UAT visual em produção:** dono verificou o gráfico de evolução de cardio no PWA de produção e reportou "passou" (2026-08-14) — fecha a Fase 5 em 11/11 e o requisito PUB-04 com o smoke cumprido direto em produção.

---

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
