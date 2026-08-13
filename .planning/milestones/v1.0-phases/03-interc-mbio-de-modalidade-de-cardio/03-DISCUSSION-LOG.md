# Phase 3: Intercâmbio de modalidade de cardio - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-09
**Phase:** 03-interc-mbio-de-modalidade-de-cardio
**Areas discussed:** Meta e realizado na nova modalidade

---

## Seleção de áreas

| Option | Description | Selected |
|--------|-------------|----------|
| Ponto de entrada da troca | Só recusa, só botão visível, ou os dois | |
| Fonte das modalidades aceitas | Chips do questionário (opcionais) × fallback quando vazio | |
| Escopo da troca | Só a sessão × lembrada × perguntar | |
| Meta e realizado na nova | Registro de distância e contagem no Progresso | ✓ |

**User's choice:** Só "Meta e realizado na nova"; demais áreas a critério do Claude.

---

## Meta e realizado na nova modalidade

### Q1 — Registro de distância realizada na trocada

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, quando fizer sentido (Recomendado) | Campo opcional se a nova modalidade tem métrica de distância | ✓ |
| Não, troca registra só tempo | Só duração na trocada | |

### Q2 — Km realizado da trocada no Progresso (REVISADA — ver Q7)

| Option | Description | Selected |
|--------|-------------|----------|
| Conta junto: km é km (Recomendado) | Realizado km soma qualquer modalidade | ✓ (final, via Q7) |
| Só tempo e sessões contam | Km da trocada fora do realizado km | |
| Conta separado, com anotação | Linha à parte para km de trocadas | (escolhida inicialmente, revertida) |

**Notes:** Na checagem final o dono corrigiu: "quero que os cardios com outra
modalidade conte nos km's da semana" — modelo final é "km é km", sem linha separada.

### Q3 — Visibilidade da troca na UI

| Option | Description | Selected |
|--------|-------------|----------|
| Marca na sessão e no histórico (Recomendado) | Referência à original nos dois lugares | ✓ |
| Marca só durante a sessão | Histórico sem menção à original | |
| Não marca | Troca transparente | |

### Q4 — Prescrito km da sessão trocada (REVISADA — ver Q7)

| Option | Description | Selected |
|--------|-------------|----------|
| Desconta a sessão trocada (Recomendado à época) | Prescrito km só das sessões não trocadas | (escolhida inicialmente, revertida) |
| Mantém o prescrito cheio | Prescrito como o plano definiu | ✓ (final, via Q7) |

### Q5 — Avaliação da sessão trocada

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, avalia por tempo igual (Recomendado) | under/on_target/over por tempo | ✓ |
| Não julga a trocada | Sessão trocada sem classificação | |

### Q6 — Forma da linha de km trocado (TORNOU-SE MOOT após Q7)

| Option | Description | Selected |
|--------|-------------|----------|
| Agregada (Recomendado) | "+2,5 km em outras modalidades" | ✓ (moot) |
| Por modalidade | Uma linha por modalidade trocada | |

**Notes:** Com a revisão da Q2 (km conta junto), a linha separada deixou de existir.

### Q7 — Revisão do dono + coerência do prescrito

**User's choice (verbatim):** "pront eu só quero mudar uma resposta, quero que os
cardios com outra modalidade conte nos km`s da semana"

Confirmação de coerência: com realizado "km é km", o prescrito km volta a ficar cheio
(simétrico). Dono escolheu "Mantém prescrito cheio (Recomendado)".

---

## Claude's Discretion

- Ponto de entrada da troca (os dois sinais do roadmap devem ser atendidos; forma de UI a critério)
- Fonte das modalidades aceitas + fallback quando chips vazios
- Escopo/persistência da troca (atenção à porta de mão única do schema do plano)
- Copy, componentes, nomes — CONVENTIONS.md

## Deferred Ideas

None — discussão dentro do escopo.
