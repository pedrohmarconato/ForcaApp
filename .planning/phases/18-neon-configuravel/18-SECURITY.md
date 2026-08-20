---
phase: 18
slug: neon-configuravel
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-20
---

# Phase 18 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Auditoria retroativa (retroactive-STRIDE): a Fase 18 não tinha PLAN.md com
`<threat_model>` (`register_authored_at_plan_time: false`) e nenhum SUMMARY
carrega `## Threat Flags`. O registro abaixo foi construído a partir da
implementação viva e cada mitigação foi verificada no código/SQL, não nas
autodeclarações dos SUMMARYs.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| App ↔ Supabase (PostgREST) | Escrita/leitura de `profiles.neon_color` autenticada por JWT | Preferência de cor por conta (dado de perfil, baixo sigilo, alto valor de integridade) |
| App ↔ Live Activity (iOS) | Encanamento da cor via módulo nativo até o widget | `neonColor` validado na fronteira do engine e no Swift |
| Tooling ↔ Supabase staging | Scripts de UAT/RLS com service-role key | Credenciais admin (alto sigilo) — allowlist staging-only |
| Build ↔ device | `resign.sh` lê `app.json`/env e compila/instala | `expo.name`, env `EXPO_PUBLIC_*` |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| IDOR-01 | Tampering/EoP — escrita cross-conta de `neon_color` | `profiles` (PostgREST) | high | mitigate | RLS `profiles update own` (`auth.uid()=id`, `0000_profiles_base.sql:33-35`) re-assertada pela `0040:86-100` (aplicada a local e produção em 20/08); payload de coluna única com `.eq('id', userId)` (`neonPreferenceRepository.ts:13-18`); guarda `saved.id !== token.ownerId` (`ThemeProvider.tsx:258-260`) | closed |
| DISC-01 | Information Disclosure — vazamento cross-conta da cor | `profiles` (PostgREST) + ThemeProvider | medium | mitigate | RLS `profiles select own` (`0000:25-27`) cobre a coluna nova; `profileMatchesUser` com fallback `'yellow'` em mismatch (`ThemeProvider.tsx:143-146,212-231`) | closed |
| INJ-01 | Tampering — valor malformado de `neon_color` | migration + engine + widget | low | mitigate | CHECK fechado no banco (`0040:6-8`); allowlist `parseNeonColor` (`theme.ts:44-48`); revalidação na fronteira da Live Activity (`liveActivityContentState.ts:190-192`); `switch` fechado com default amarelo (`WidgetLiveActivity.swift:18-31`) | closed |
| SECRET-01 | Information Disclosure — vazamento de service-role/senhas no tooling de UAT | `scripts/neon-uat-accounts.mjs` | high | mitigate | Sanitização de env antes de `spawn` (`:76-99`); `secureFile` exige 0600/uid/sem symlink (`:156-175`); segredo via stdin, nunca argv (`:524-552`); `inspectWebBundles` falha o build se a key/ref vazar (`:462-488`) | closed |
| CMDI-01 | Tampering — injeção de comando via `expo.name` no resign | `scripts/resign.sh` | high | mitigate | WR-03 presente no script vivo: valores entram no `node -e` por env var (`resign.sh:162-173`), sem interpolação em string JS; sentinela `verify-resign-name-escaping.sh` | closed |
| ENV-01 | Tampering — tooling admin mirando produção/localhost por engano | scripts UAT/RLS + resign | high | mitigate | `validateStagingUrl` com allowlist exata do staging (`neon-rls-smoke.mjs:17-39`), reusada por `validateEnvFile`; `validar_env_supabase_uat` recusa ref de produção e localhost quando `FORCA_EXPECT_SUPABASE_REF` é setado (`resign.sh:33-71`) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks.

---

## Follow-ups (não bloqueantes)

- **IDOR-01 — prova comportamental pendente**: a mitigação (policy RLS) está
  provada presente e assertada estruturalmente, mas o smoke comportamental
  (`scripts/neon-rls-smoke.mjs` exercitando negação cross-conta contra uma
  instância viva) nunca rodou — é staging-only por design e depende de decisão
  do dono (aplicar 0040 ao staging e rodar, variante local, ou waive). Ver
  `18-UAT.md` e `18-03-SUMMARY.md` (`human_judgment: true`).
- Os warnings WR-01/WR-02/WR-03 do `18-REVIEW.md` foram reavaliados sob STRIDE
  e não constituem superfície de ataque (staleness/estilo/acessibilidade em
  sessão do próprio usuário) — permanecem no trilho de qualidade, não de
  segurança.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-20 | 6 | 6 | 0 | gsd-security-auditor (retroactive-STRIDE, ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-20
