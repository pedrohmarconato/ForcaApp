---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 1
total_count: 1
last_updated: 2026-08-15T11:58:01.555Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 11 | deviation | public/register-sw.js |  | UpdateBanner (11-02) nao le nenhuma flag sincrona de register-sw.js (11-01) para o caso do evento sw-update-available ja ter disparado antes do useEffect montar (register() resolvendo antes do React montar). Nenhum truth/behavior testado exige isso e o arquivo esta fora do files_modified de 11-02; risco residual: em visita repetida rapida, o banner pode nao aparecer nessa carga de pagina especifica (a proxima carga natural ainda funciona). Considerar window.__swUpdateAvailable em register-sw.js se o UAT de producao (11-03) confirmar o caso. | fixed |  | 2026-08-15T03:38:11.325Z | 2026-08-15T11:58:01.555Z |

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
  }
]
````
