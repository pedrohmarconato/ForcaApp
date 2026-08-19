#!/usr/bin/env bash
# scripts/verify-intent-action-queue-race.sh — prova de concorrência do
# IntentActionQueue (WR-02, review 2026-08-19).
#
# Compila o arquivo REAL (modules/live-activity/ios/IntentActionQueue.swift,
# sem mock e sem cópia) junto com o harness e enfileira 20 ações em paralelo
# em 8 filas concorrentes — o pior caso real de toques rápidos sucessivos na
# Lock Screen. Exit 0 = as 20 sobreviveram; exit != 0 = o read-modify-write
# perdeu entrada (a serialização regrediu). Limpeza da chave no fim.
#
# Uso:
#   bash scripts/verify-intent-action-queue-race.sh

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BIN="$(mktemp -d)/iaq-concurrency-test"
swiftc \
  modules/live-activity/ios/IntentActionQueue.swift \
  scripts/IntentActionQueueConcurrencyTests/main.swift \
  -o "$BIN"

"$BIN"
rm -rf "$(dirname "$BIN")"
