# Phase 9: Fechamento de gaps do runtime web - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-14
**Phase:** 9-Fechamento de gaps do runtime web
**Areas discussed:** Visual do diálogo web, Ciclo do Wake Lock, Guarda de regressão

---

## Visual do diálogo web

| Option | Description | Selected |
|--------|-------------|----------|
| Modal custom temático | AlertHost no molde dos 5 sheets existentes (Modal RN + StyleSheet + theme.ts) | ✓ |
| window.confirm/alert do browser | Zero UI nova, visual cru do Safari | |

| Option | Description | Selected |
|--------|-------------|----------|
| Repassa ao Alert.alert nativo | Platform.OS decide dentro do shim (padrão haptics/secureStorage) | ✓ |
| Modal custom em todas as plataformas | Visual unificado, mas muda UX nativa provada | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mesma assinatura de Alert.alert | Drop-in — call sites mudam só o import | ✓ |
| API própria semântica | showError/confirm — mais legível, diff maior | |

**User's choice:** as três recomendações aceitas.
**Notes:** scout prévio corrigiu a premissa: 12 call sites em 4 arquivos (não 6) + import morto em PostQuestionnaireChat.tsx.

---

## Ciclo do Wake Lock

| Option | Description | Selected |
|--------|-------------|----------|
| Liberar ao concluir | Lock solta quando a sessão vira 'finished'; resumo deixa o iPhone bloquear | ✓ |
| Manter até sair da tela | Comportamento atual (solta só no popToTop) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Silencioso, no-op | Padrão haptics.ts — sem aviso quando Wake Lock indisponível | ✓ |
| Aviso discreto uma vez | Banner único "sua tela pode bloquear" | |

| Option | Description | Selected |
|--------|-------------|----------|
| Re-adquirir sempre | Se expo-keep-awake não cobrir, listener de visibilitychange próprio | ✓ |
| Só o que o pacote der | Aceitar comportamento do expo-keep-awake como está | |

**User's choice:** as três recomendações aceitas.
**Notes:** achado do scout: useKeepAwake já roda na ActiveSessionScreen:72 e expo-keep-awake@15 já implementa a Web Wake Lock API — a fase trata ciclo de vida, não implementação do zero. Researcher confirma re-aquisição do pacote (D-07).

---

## Guarda de regressão

| Option | Description | Selected |
|--------|-------------|----------|
| Guarda permanente | Teste jest que falha com Alert.alert/import fora do shim | ✓ |
| Auditoria única | Grep manual só nesta fase | |

| Option | Description | Selected |
|--------|-------------|----------|
| Teste de render + callbacks | Modal web provado com @testing-library (precedente secureStorageWeb.test.ts) | ✓ |
| Só UAT manual | Sem proteção automatizada de comportamento | |

**User's choice:** as duas recomendações aceitas.
**Notes:** motivação: Pitfall 5 da pesquisa — a classe do bug reaparece nas Fases 10-13 (ex.: opt-in de push) sem guarda.

## Claude's Discretion

- Nomes/locais dos arquivos novos (alertShim, AlertHost) por CONVENTIONS.md
- Detalhes visuais do modal dentro do theme.ts e molde dos sheets
- Mecânica da liberação do lock ao concluir
- Forma exata da guarda (teste de varredura vs lint)
- Remoção do import morto no passe de migração
- Copy dos diálogos preservada (migração de mecanismo, não de conteúdo)

## Deferred Ideas

None — discussion stayed within phase scope.
