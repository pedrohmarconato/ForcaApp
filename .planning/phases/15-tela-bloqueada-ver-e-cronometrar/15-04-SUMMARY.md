---
phase: 15-tela-bloqueada-ver-e-cronometrar
plan: 04
subsystem: infra
tags: [supabase, expo, ios, env, resign, production]

# Dependency graph
requires:
  - phase: 14-funda-o-nativa
    provides: npm run resign, signed Release build pipeline, and native skeleton verification
provides:
  - Local native app environment pointed at production Supabase
  - Re-signed and installed iOS Release bundle with the production ref embedded
affects: [15-02, 15-03, 15-05, 15-06, native-login]

# Actuals (#2632)
actuals:
  tokens: 2200
  tasks: 1
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Securely resolve production project identity and anon key by exact Supabase ref
    - Atomically replace only the two target variables in the gitignored .env

key-files:
  created:
    - .planning/phases/15-tela-bloqueada-ver-e-cronometrar/15-04-SUMMARY.md
  modified:
    - .env

key-decisions:
  - "Use only ref zanqygwsgxkyjiuhrzju after verifying project name forcaapp-prod and organization ltmhaqdcvidzsbfkxmii through the authenticated Supabase API."
  - "Keep .env gitignored and never stage or print the production anon key; .env.example remains untouched."
  - "Do not perform physical UAT here; installation and login behavior remain in the later Phase 15 physical-session plans."

patterns-established:
  - "Production env changes are verified against the same project's live Auth endpoint before replacement."
  - "A candidate .env is checked for non-target-line equality and atomically renamed, preventing a half-updated configuration."

requirements-completed: []

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "The gitignored .env uses the production Supabase project ref for both target variables and no longer contains the local endpoint marker."
    verification:
      - kind: other
        ref: "secure .env verification: exact URL/ref and anon-key equality against supabase projects api-keys --project-ref zanqygwsgxkyjiuhrzju"
        status: pass
    human_judgment: false
  - id: D2
    description: "The signed Release iOS bundle was rebuilt, installed on the connected device, and passed the native-skeleton gate after the environment change."
    verification:
      - kind: integration
        ref: "npm run resign (8/8; BUILD SUCCEEDED; app installed; verify-native-skeleton.sh passed)"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-08-17
status: complete
---

# Phase 15 Plan 04: Supabase de produção no bundle nativo — Summary

**O `.env` local agora aponta o app nativo para o Supabase de produção, e o bundle iOS Release foi reassinado, instalado e validado sem expor a anon key.**

## Performance

- **Duration:** aproximadamente 20 min
- **Started:** 2026-08-17T12:10:00Z (estimado nesta retomada; o executor anterior não deixou timestamp)
- **Completed:** 2026-08-17T12:29:47Z
- **Tasks:** 1
- **Files modified:** 1 runtime file (`.env`, gitignored) + 1 planning summary

## Accomplishments

- Confirmada, pela CLI/API autenticada, a identidade exata `zanqygwsgxkyjiuhrzju` → projeto `forcaapp-prod` → organização `ltmhaqdcvidzsbfkxmii`; o Project URL verificado foi `https://zanqygwsgxkyjiuhrzju.supabase.co`.
- Obtida a anon public key do mesmo ref via `supabase projects api-keys`, usada somente em memória e nunca impressa; o endpoint Auth desse projeto respondeu HTTP 200.
- Alterados apenas `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` no `.env`; a substituição atômica preservou todas as demais linhas, manteve `.env` gitignored e deixou `.env.example` intacto.
- `npm run resign` concluiu os 8/8 passos: build Release, instalação no device conectado e `verify-native-skeleton.sh` aprovado; o `main.jsbundle` contém o ref de produção e não contém `127.0.0.1:54321`.

## Task Commits

The runtime artifact is intentionally gitignored, so the task commit contains only this non-secret execution record; no production key was staged.

1. **Task 1: apontar `.env` para produção e reconstruir o bundle nativo** — `DOC_COMMIT_PENDING` (`docs`)

**Plan metadata:** final GSD documentation commit will include the state/roadmap updates.

## Files Created/Modified

- `.env` — arquivo local gitignored; somente as duas variáveis Supabase foram trocadas.
- `.planning/phases/15-tela-bloqueada-ver-e-cronometrar/15-04-SUMMARY.md` — evidência da execução, sem a anon key.

## Decisions Made

- O ref foi validado por identidade de projeto e por uma chamada Auth ao mesmo endpoint antes de usar os valores.
- A anon public key não aparece no chat, nos logs de verificação, no summary nem em qualquer commit; `.env` não foi forçado ao Git.
- A confirmação física de login e o UAT de Lock Screen permanecem fora deste plano, conforme o escopo; não foram executados nem declarados.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Substituição atômica em vez de duas edições independentes**
- **Found during:** Task 1 (apontar `.env` e reconstruir o bundle)
- **Issue:** Duas substituições independentes poderiam deixar URL e chave em projetos diferentes se a segunda falhasse.
- **Fix:** Os dois valores foram obtidos e verificados antes da edição; um candidato foi validado linha a linha e renomeado atomicamente, sem alterar linhas não alvo.
- **Files modified:** `.env` (gitignored)
- **Verification:** igualdade dos dois valores com a API do ref de produção; `.env.example` inalterado; marcador local ausente.
- **Committed in:** sem valor de runtime staged; registro não secreto neste summary.

---

**Total deviations:** 1 auto-fixed (Rule 2: 1)
**Impact on plan:** A mudança reforça a segurança e a atomicidade sem alterar o escopo funcional.

## Issues Encountered

- A CLI inicialmente estava na conta errada conforme o checkpoint anterior; a sessão foi resolvida com `~/.supabase_pat`, sem trocar o link local nem consultar staging.
- Duas tentativas de comando de verificação falharam apenas por sintaxe de shell antes da edição; foram corrigidas sem tocar no `.env` e sem expor valores.
- O build emitiu warnings conhecidos do bundle/Xcode, mas terminou com `BUILD SUCCEEDED`, instalação concluída e gate nativo verde.

## Auth Gates

O checkpoint de autenticação anterior foi resolvido: o PAT já acessível permitiu listar projetos, confirmar o ref e obter a anon public key correspondente ao projeto de produção. Nenhum segredo foi impresso ou incluído no histórico.

## User Setup Required

None — os valores foram resolvidos de forma autenticada nesta execução. Nenhuma configuração manual adicional foi feita.

## Next Phase Readiness

- O próximo plano pode continuar a expansão da Live Activity sem depender do Supabase local.
- Os planos físicos posteriores podem usar o bundle instalado com produção; login real e UAT físico continuam deliberadamente pendentes deles.
- `LOCK-03` permanece pendente: este plano só prepara o backend/configuração para o uso físico e não implementa o ciclo de vida da Activity.

---
*Phase: 15-tela-bloqueada-ver-e-cronometrar*
*Plan: 04*
*Completed: 2026-08-17*
