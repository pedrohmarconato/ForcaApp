---
id: dynamic-island-future-device
created: 2026-08-17
source: 15-05 (Sessão 1 física no iPhone 13)
severity: future-feature
resolves_phase:
---

# Validar e ajustar Dynamic Island em aparelho compatível

## Decisão do dono (2026-08-17, literal)

> "se não pode vamos pular essa parte e colocamos como feature no futuro pois não tenho aparelho mais novo para teste"

## Estado atual

- O widget já contém as apresentações `compact`, `expanded` e `minimal`.
- O aparelho disponível é um iPhone 13 (`iPhone14,5`), sem Dynamic Island.
- Lock Screen, timer nativo, overtime e card `blockOnly` passaram no aparelho real.
- Nenhuma apresentação da Dynamic Island foi declarada `PASS` sem UAT.

## Quando retomar

Quando houver acesso a iPhone com Dynamic Island:

1. Validar `compact` com sessão ativa e durante descanso.
2. Validar `expanded` por toque prolongado.
3. Validar `minimal` com outra Live Activity concorrente, como o Timer do iOS.
4. Ajustar layout/legibilidade conforme o resultado e repetir o UAT.

Este item é feature futura e não bloqueia o v1.3 nem o Plano 15-06.
