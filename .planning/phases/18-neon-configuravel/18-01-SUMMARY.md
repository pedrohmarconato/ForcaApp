---
phase: 18-neon-configuravel
plan: 01
subsystem: ui
tags: [react, typescript, theme, supabase, optimistic-update]

# Dependency graph
requires: []
provides:
  - "Fábrica de tema com allowlist yellow, blue, green e red, derivados RGB e fallback amarelo."
  - "ThemeProvider, useTheme e useThemeStyles para tema reativo dentro de AuthProvider."
  - "Repository dedicado para persistir apenas profiles.neon_color."
affects: ["18-04..18-09 consumidores runtime", "18-08 Live Activity", "18-15 UAT"]

# Não há execução atribuível a commits deste plano no histórico disponível.
actuals:
  tokens: unknown
  tasks: unknown
  commits: 0

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tema corrente criado por factory memoizada; singleton amarelo permanece congelado como fallback."
    - "Identidade confirmada por profile.id === user.id; writes usam token por owner e fila da última intenção."

key-files:
  created:
    - "src/theme/ThemeProvider.tsx"
    - "src/services/neonPreferenceRepository.ts"
    - "__tests__/neonTheme.test.tsx"
  modified:
    - "src/theme/theme.ts"
    - "App.tsx"

key-decisions:
  - "ThemeProvider fica abaixo de AuthProvider e expõe useTheme/useThemeStyles sem remontar a subárvore por cor."
  - "A persistência usa repository Supabase dedicado, sem AuthContext.updateProfile e sem AsyncStorage adicional."
  - "O tema amarelo default é profundamente congelado; cores desconhecidas resolvem para yellow."

patterns-established:
  - "Derivar soft, border e focus do RGB do accent.main, mantendo accent.on em #0A0A0A."
  - "Preview otimista, confirmação, rollback e retry sem deixar resposta de owner obsoleto alterar outra conta."

requirements-completed: [THEME-01, THEME-03, PREF-02, PREF-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Paleta fechada, derivados de acento, contraste WCAG AA, status funcionais invariantes e fallback yellow."
    requirement: "THEME-01"
    verification:
      - kind: unit
        ref: "npx jest __tests__/neonTheme.test.tsx --runInBand --silent"
        status: pass
    human_judgment: false
  - id: D2
    description: "ThemeProvider, hooks, repository dedicado e fronteira AuthProvider > ThemeProvider sem remount."
    requirement: "PREF-02"
    verification:
      - kind: integration
        ref: "npx jest __tests__/neonTheme.test.tsx --runInBand --silent"
        status: pass
    human_judgment: false
  - id: D3
    description: "Transição de identidade, respostas assíncronas obsoletas, serialização, rollback e retry."
    requirement: "PREF-03"
    verification:
      - kind: unit
        ref: "__tests__/neonTheme.test.tsx — testes de A -> B, erro/retry e 'A volta antes do save resolver e serializa a última intenção sem overlap'"
        status: pass
    human_judgment: true
    rationale: "A suíte local prova ausência de overlap e convergência da última intenção, mas o acceptance criterion do PLAN também descreve duplo toque como uma única chamada ao repository; o código atual faz uma segunda chamada serializada para a intenção enfileirada."

# Métricas não atribuíveis sem log de execução ou diff commitado do plano.
metrics:
  duration: unknown
  completed: 2026-08-18
  status: complete
---

# Phase 18: Neon configurável — Plan 01 Summary

**Núcleo de tema neon reativo com persistência por conta, preview otimista e guards de identidade.**

## Performance

- **Duration:** unknown — não existe log de início/fim desta execução.
- **Started:** unknown.
- **Completed:** 2026-08-18 — data desta documentação, não duração da implementação.
- **Tasks:** unknown como execução histórica; o PLAN define 2 tasks e os artefatos correspondentes existem.
- **Files modified:** 5 arquivos listados no PLAN e presentes no working tree.

## Accomplishments

- `theme.ts` declara exatamente as quatro chaves e hexes aprovados, deriva `soft`, `border` e `focus`, preserva `colors.status` e congela o tema amarelo default.
- `ThemeProvider.tsx` expõe tema, cor efetiva, cor confirmada, status, mensagem, seleção e retry; mismatch entre `profile.id` e `user.id` cai para yellow no render observado.
- `neonPreferenceRepository.ts` atualiza somente `profiles.neon_color`, filtra pelo `id` e propaga erro ou a linha retornada.
- `App.tsx` monta `AuthProvider > ThemeProvider > restante da árvore`; o teste confirma troca de tema sem remontar o probe raiz.

## Testes executados literalmente

- `npx jest __tests__/neonTheme.test.tsx --runInBand --silent` — **PASS**, 27 testes, 0 snapshots.
- `npx tsc --noEmit` — **PASS**, processo terminou com exit code 0 e sem saída.

Os testes acima são locais. Não foi executada a suíte Jest completa, build web, build nativo ou UAT remoto nesta verificação.

## Task Commits

Não há commits identificáveis de `18-01` no histórico (`git log --all` sem resultado para `18-01..03`); os arquivos deste plano permanecem em estado não commitado no worktree. Não foi criado commit por solicitação do usuário.

## Files Created/Modified

- `src/theme/theme.ts` — allowlist, parser, `createTheme`, derivados dinâmicos e congelamento profundo.
- `src/theme/ThemeProvider.tsx` — contexto, hidratação por identidade, preview, persistência, rollback e retry.
- `src/services/neonPreferenceRepository.ts` — update dedicado de `profiles.neon_color`.
- `App.tsx` — inclusão do provider dentro de `AuthProvider`.
- `__tests__/neonTheme.test.tsx` — testes de paleta, repository, identidade, concorrência, erro, retry, hooks e árvore raiz.

## Decisions Made

- A escolha atual nunca muta o singleton histórico; cada chave cria um tema novo e congelado.
- O repository não chama `AuthContext.updateProfile`, preservando o estado de carregamento global da autenticação.
- A implementação atual usa `committedIdentityRef` e `inFlightByOwnerRef` com token por owner e fila da última intenção. Os testes confirmam que respostas antigas de A não alteram B.

## Deviations from Plan

### Diferenças observadas, sem correção

1. **Guard de geração:** o PLAN descreve uma `generation` monotônica explícita. O código atual usa assinatura de identidade confirmada, `ownerId` e identidade do token em voo. A proteção comportamental passa nos testes; a existência de um contador de geração não foi verificada porque ele não existe no código atual.
2. **Duplo toque durante `saving`:** o PLAN traz acceptance criterion de uma única chamada ao repository. O código enfileira a última intenção e faz a segunda chamada apenas após a primeira terminar; o teste `A volta antes do save resolver e serializa a última intenção sem overlap` exige essa serialização e passa. Esta divergência fica aberta para decisão do dono no gate posterior.

**Total de diferenças observadas:** 2. **Impacto:** o comportamento atual evita writes sobrepostos e preserva a última intenção, mas não prova o critério literal de uma única chamada total em duplo toque.

## Issues Encountered

- O worktree já continha alterações não commitadas de outros planos da fase 18 e arquivos de planejamento não rastreados. Sem commits de `18-01..03`, não é possível atribuir cada linha exclusivamente à execução deste plano.
- A conexão de `onThemeChange` aparece no `App.tsx` atual; a origem temporal dessa ligação em relação aos planos posteriores não é verificável no histórico disponível.

## User Setup Required

None — este plano não exige configuração externa para os testes locais.

## Next Phase Readiness

- O núcleo local está disponível para os consumidores de UI e para a integração da Live Activity.
- O Plan 18-15 deve tratar a divergência de duplo toque como decisão pendente e não considerar `PREF-03` integralmente provado apenas pela suíte local.
- Este resumo não altera `REQUIREMENTS.md`, PLANs, ROADMAP ou STATE.

---
*Phase: 18-neon-configuravel*
*Plan: 18-01*
*Completed: 2026-08-18*
