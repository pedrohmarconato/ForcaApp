# Phase 5 — Context

**Source:** Decisões do dono capturadas em sessão (2026-08-14), em vez de
/gsd-discuss-phase — o escopo foi discutido e aprovado inline (plano de release +
4 respostas de múltipla escolha).

<domain>
Fase de integração e review — NENHUMA feature nova. O gráfico de evolução de cardio
já está implementado e verificado no working tree deste clone:

- `src/engine/cardioEvolucao.ts` (113 linhas) — motor puro, deriva pace/km por
  modalidade de `CardioLog` via `paceSecondsPerKm` de `sessionModel`; sem amostra é
  "—", nunca 0 inventado.
- `src/components/progress/CardioEvolucaoChart.tsx` (260 linhas) — componente RN
  (react-native-chart-kit) com loading/erro próprios.
- `__tests__/cardioEvolucao.test.ts` (198 linhas, 20/20 verde) — ordem do eixo X,
  pace inventado, lista vazia, dedupe de modalidade, formatação pt-BR.
- `src/screens/ProgressScreen.tsx` (diff de 4 linhas) — import + `<CardioEvolucaoChart />`
  na aba Progresso, entre prescrição de cardio e Recordes.

Verificação já medida em 2026-08-14: suíte completa 147/147 suites, 1687/1687 testes
(1ª rodada teve 5 timeouts de 5000ms sob carga — flakiness conhecida, re-rodar é
aceitável); `npx tsc --noEmit` 0 erros.
</domain>

<decisions>
- **D-01 (locked):** Commit com adds NOMEADOS — nunca `git add -A`. Arquivos do
  commit de feature: `src/engine/cardioEvolucao.ts`,
  `src/components/progress/CardioEvolucaoChart.tsx`,
  `__tests__/cardioEvolucao.test.ts`, `src/screens/ProgressScreen.tsx`.
- **D-02 (locked):** `.claude/` entra no `.gitignore` (config local de sessão, não
  viaja no repo). `.planning/reviews/` é commitado como documentação, padrão do
  projeto de commitar `.planning/`.
- **D-03 (locked):** Painel adversarial de 4 revisores sobre TODO o diff que vai a
  produção (não só o commit novo): agentes `revisor-seguranca`,
  `revisor-integridade`, `revisor-regressao`, `revisor-contrato` (skill /painel do
  usuário). Só achados CONFIRMADOS com file:linha contam; cada um é corrigido ou
  explicitamente aceito pelo dono. Achado corrigido exige teste que reproduza o modo
  de falha antes do fix (regra do projeto).
- **D-04 (locked):** Verificação local ANTES do commit: `npx tsc --noEmit` com 0
  erros; suíte jest completa verde (re-rodar 1x em caso de timeout de carga é
  aceitável e deve ser reportado); teste novo 20/20; `python -m pytest backend/tests -q`
  se o Python do repo estiver disponível localmente (senão, registrar que pytest
  ficou para o CI da Fase 6).
- **D-05 (locked):** Reconferir branch (`main`) e working tree antes de qualquer
  commit — outras sessões usam clones/branches paralelos; nunca presumir o estado.
- **D-06 (locked):** NENHUM push nesta fase — push e CI são a Fase 6. A fase termina
  com commits locais + relatório do painel.
- **D-07 (locked):** Escopo fechado: os 4 arquivos do cardio + `.gitignore` +
  `.planning/reviews/`. Nada de refactor, dependência nova ou "melhoria" extra.
- **D-08 (locked):** Mensagens de commit em conventional commits
  (`feat:`/`chore:`/`docs:`), sem gerúndio, corpo curto.
</decisions>

### Claude's Discretion

- Granularidade dos commits (feature + higiene juntos ou separados) — sugerido:
  `chore: adiciona .claude/ ao .gitignore` separado do `feat:` do gráfico e do
  `docs:` do `.planning/reviews/`.
- Ordem de execução do painel (antes ou depois do commit local) — sugerido: commitar
  primeiro para o diff ficar endereçável, painel na sequência; correção de achado
  vira commit adicional na própria fase.

<specifics>
- O diff que o painel avalia é `origin/main..HEAD` (tudo que vai a produção inclui os
  ~46 commits já feitos + o(s) commit(s) novo(s) desta fase).
- `.planning/reviews/` untracked contém reviews de ciclo anterior — commitar como
  está, sem editar conteúdo.
- Máquina sem toolchain nativa iOS/Android: verificação é jest/tsc/CLI apenas.
  `Alert.alert` é no-op no alvo web (dívida conhecida, fora do escopo).
</specifics>

<deferred>
- Push para origin/main → Fase 6 (PUB-01).
- Migration 0037 → Fase 7. Deploy Vercel → Fase 8.
- Config ESLint, flakiness de timeouts → fora do milestone (Out of Scope em
  REQUIREMENTS.md).
</deferred>
