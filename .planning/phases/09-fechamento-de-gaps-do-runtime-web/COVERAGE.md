# Phase 9 — API Coverage Decision: Screen Wake Lock API

O detector automático (`api-coverage.cjs`) não marcou esta fase como integração de
API externa (`detected: false`) — não há SDK/REST/GraphQL envolvido. Mas o
orquestrador sinalizou explicitamente que a Screen Wake Lock API do browser
(`navigator.wakeLock`, acessada via `expo-keep-awake`) é uma superfície de API de
plataforma que esta fase integra (SESS-01) e que deve ser decidida sob esta regra.

## Matriz de cobertura

| capability | decision | reason |
|---|---|---|
| `request` (`navigator.wakeLock.request('screen')`, via `activateKeepAwakeAsync(tag)`) | INTEGRATE | Núcleo do SESS-01 — solicita o lock quando `status` é `'active'`/`'awaiting_checkin'` (D-05). |
| `release` (`sentinel.release()`, via `deactivateKeepAwake(tag)`) | INTEGRATE | Libera o lock ao concluir a sessão (`status === 'finished'`, D-05) e no cleanup do `useEffect`. |
| re-acquire on `visibilitychange` | INTEGRATE | D-07 (obrigatório pelo CONTEXT.md) — `expo-keep-awake@15.0.8` web NÃO re-adquire sozinho (confirmado lendo `ExpoKeepAwake.web.ts` na íntegra); a fase adiciona listener próprio de `document.visibilitychange`. |
| evento `released` do `WakeLockSentinel` | OPT-OUT | O evento é usado só internamente pelo `expo-keep-awake` (`addListenerForTag`) para notificação passiva. A fase não precisa reagir a ele: a re-aquisição já é dirigida por `status` + `visibilitychange`, não pelo evento `release` do sentinel — escutá-lo duplicaria a mesma reação sem ganho. |
| feature-detection (`isAvailableAsync()` / `'wakeLock' in navigator`) | INTEGRATE | D-06 exige fallback silencioso sem suporte (iOS < 16.4, browser incompatível) — implementado via `try/catch` silencioso ao redor de `activateKeepAwakeAsync`/`deactivateKeepAwake` (mesmo padrão de `haptics.ts`), que cobre tanto a ausência da API quanto qualquer erro de runtime, sem precisar chamar `isAvailableAsync()` separadamente. |

## Nota de risco de plataforma (fora da matriz)

Bug documentado da Apple/WebKit (`bugs.webkit.org#254545`, corrigido só no iOS
18.4, março/2025) faz a Screen Wake Lock API não funcionar em apps instalados
pela Tela de Início (Home Screen Web App) em qualquer iOS entre 16.4 e 18.3.x —
mesmo com todas as capabilities acima corretamente integradas. Isso não é uma
capability a decidir (é uma limitação de plataforma), mas condiciona o UAT desta
fase — ver o checkpoint de UAT em `09-04-PLAN.md`.
