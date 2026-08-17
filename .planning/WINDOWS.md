---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 3
total_count: 4
last_updated: 2026-08-17T02:53:42.318Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 11 | deviation | public/register-sw.js |  | UpdateBanner (11-02) nao le nenhuma flag sincrona de register-sw.js (11-01) para o caso do evento sw-update-available ja ter disparado antes do useEffect montar (register() resolvendo antes do React montar). Nenhum truth/behavior testado exige isso e o arquivo esta fora do files_modified de 11-02; risco residual: em visita repetida rapida, o banner pode nao aparecer nessa carga de pagina especifica (a proxima carga natural ainda funciona). Considerar window.__swUpdateAvailable em register-sw.js se o UAT de producao (11-03) confirmar o caso. | fixed |  | 2026-08-15T03:38:11.325Z | 2026-08-15T11:58:01.555Z |
| 2 | 13 | deviation | supabase/migrations/0038_push_subscriptions.sql |  | Migration 0038 criada e testada (DO-block de asserção) mas aplicação em staging (mjdjtiujhwklchalquhc) BLOQUEADA: SUPABASE_ACCESS_TOKEN do ambiente pertence a outra conta/org sem acesso ao ForcaApp. Dono precisa supabase login + relink + db push antes do UAT do Plano 13-04. | fixed |  | 2026-08-15T15:23:22.926Z | 2026-08-15T19:19:28.797Z |
| 3 | 13 | deviation | supabase/migrations/0039_push_reminder_idempotencia.sql |  | Migration 0039 (reminder_sent_at + índice parcial) criada e testada (DO-block de asserção) mas aplicação em staging (mjdjtiujhwklchalquhc) BLOQUEADA: mesma credencial documentada na entrada #2 (SUPABASE_ACCESS_TOKEN do ambiente sem acesso ao org do ForçaApp). Dono precisa aplicar 0038 e 0039 juntas antes do UAT do Plano 13-04. | fixed |  | 2026-08-15T15:38:28.515Z | 2026-08-15T19:19:28.896Z |
| 4 | 15 | stub | src/engine/liveActivityContentState.ts | 44 | blockLabel/blockIndex/blockTotal permanecem null nesta tracer; o Plano 15-02 emitirá blockOnly. | open |  | 2026-08-17T02:53:42.318Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "11",
    "file": "public/register-sw.js",
    "line": null,
    "description": "UpdateBanner (11-02) nao le nenhuma flag sincrona de register-sw.js (11-01) para o caso do evento sw-update-available ja ter disparado antes do useEffect montar (register() resolvendo antes do React montar). Nenhum truth/behavior testado exige isso e o arquivo esta fora do files_modified de 11-02; risco residual: em visita repetida rapida, o banner pode nao aparecer nessa carga de pagina especifica (a proxima carga natural ainda funciona). Considerar window.__swUpdateAvailable em register-sw.js se o UAT de producao (11-03) confirmar o caso.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-15T03:38:11.325Z",
    "resolved_at": "2026-08-15T11:58:01.555Z"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "13",
    "file": "supabase/migrations/0038_push_subscriptions.sql",
    "line": null,
    "description": "Migration 0038 criada e testada (DO-block de asserção) mas aplicação em staging (mjdjtiujhwklchalquhc) BLOQUEADA: SUPABASE_ACCESS_TOKEN do ambiente pertence a outra conta/org sem acesso ao ForcaApp. Dono precisa supabase login + relink + db push antes do UAT do Plano 13-04.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-15T15:23:22.926Z",
    "resolved_at": "2026-08-15T19:19:28.797Z"
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "13",
    "file": "supabase/migrations/0039_push_reminder_idempotencia.sql",
    "line": null,
    "description": "Migration 0039 (reminder_sent_at + índice parcial) criada e testada (DO-block de asserção) mas aplicação em staging (mjdjtiujhwklchalquhc) BLOQUEADA: mesma credencial documentada na entrada #2 (SUPABASE_ACCESS_TOKEN do ambiente sem acesso ao org do ForçaApp). Dono precisa aplicar 0038 e 0039 juntas antes do UAT do Plano 13-04.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-15T15:38:28.515Z",
    "resolved_at": "2026-08-15T19:19:28.896Z"
  },
  {
    "id": 4,
    "kind": "stub",
    "phase": "15",
    "file": "src/engine/liveActivityContentState.ts",
    "line": 44,
    "description": "blockLabel/blockIndex/blockTotal permanecem null nesta tracer; o Plano 15-02 emitirá blockOnly.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T02:53:42.318Z",
    "resolved_at": null
  }
]
````
