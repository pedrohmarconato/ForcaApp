// scripts/IntentActionQueueConcurrencyTests.swift
//
// Teste de concorrência do IntentActionQueue (achado WR-02 do review
// 2026-08-19): enfileira N ações em paralelo e prova que as N sobrevivem.
// Sem serialização, enqueue/remove fazem read-modify-write sobrepostos no
// UserDefaults do App Group e toques rápidos sucessivos na Lock Screen
// podem perder uma entrada em silêncio.
//
// Compilado junto com o arquivo REAL (sem mock, sem cópia):
//   swiftc modules/live-activity/ios/IntentActionQueue.swift \
//           scripts/IntentActionQueueConcurrencyTests.swift \
//           -o /tmp/iaq-concurrency-test
//
// Exit 0 = as N entradas sobreviveram à corrida. Exit != 0 = perdeu
// entrada (o read-modify-write não é atômico). O harness limpa a chave do
// domínio ao final — um CLI no macOS não compartilha defaults com o
// simulador iOS, mas o teste não deixa resíduo mesmo assim.

import Foundation

let suite = "group.com.pmarconato.forcaapp.shared"
let key = "pendingLiveActivityIntentActions"

func falhar(_ mensagem: String) -> Never {
  FileHandle.standardError.write(Data("FALHA: \(mensagem)\n".utf8))
  exit(1)
}

// N == maxEntries (20, cap explícito de IntentActionQueue): as N entradas
// enfileiradas em paralelo DEVEM sobreviver todas — nenhum cap entra em
// ação com 20 entradas, então qualquer perda é corrida, não poda.
let n = 20
let ids = (0..<n).map { _ in UUID().uuidString }

let iso = ISO8601DateFormatter()
let group = DispatchGroup()
// 8 filas concorrentes disputam o mesmo UserDefaults — o pior caso real
// de toques rápidos sucessivos na Lock Screen (intents em threads de fundo).
let workers = (0..<8).map { DispatchQueue(label: "iaq-test-worker-\($0)", attributes: .concurrent) }

for (i, id) in ids.enumerated() {
  let fila = workers[i % workers.count]
  group.enter()
  fila.async {
    IntentActionQueue.enqueue(
      QueuedIntentAction(
        kind: .adjustLoad,
        deltaSeconds: nil,
        deltaValue: Double(i),
        sessionLogId: nil,
        queuedAt: iso.string(from: Date()),
        id: id
      )
    )
    group.leave()
  }
}

if group.wait(timeout: .now() + 30) == .timedOut {
  falhar("timeout esperando os 20 enqueues concorrentes terminarem")
}

let sobreviventes = IntentActionQueue.peekAll()
let idsPresentes = Set(sobreviventes.map(\.id))
let idsEsperados = Set(ids)

// Limpeza: remove só a chave gravada por este processo.
UserDefaults(suiteName: suite)?.removeObject(forKey: key)
UserDefaults(suiteName: suite)?.synchronize()

if idsPresentes != idsEsperados {
  let perdidas = idsEsperados.count - idsPresentes.count
  falhar(
    "\(perdidas) de \(idsEsperados.count) entradas perdidas na corrida "
      + "(sobreviveram \(idsPresentes.count)) — enqueue sem serialização "
      + "faz read-modify-write sobreposto no UserDefaults do App Group"
  )
}

print("OK: \(sobreviventes.count) entradas enfileiradas em paralelo sobreviveram intactas")
