// scripts/IntentActionQueueConcurrencyTests.swift
//
// Dois testes standalone do IntentActionQueue REAL, cada um provando um
// achado de review distinto sobre a mesma fila durável do App Group:
//
// 1) Concorrência (achado WR-02 do review 2026-08-19): enfileira N ações em
//    paralelo e prova que as N sobrevivem. Sem serialização, enqueue/remove
//    fazem read-modify-write sobrepostos no UserDefaults do App Group e
//    toques rápidos sucessivos na Lock Screen podem perder uma entrada em
//    silêncio.
// 2) Decode elemento a elemento (achado IN-03 do review 2026-08-19): grava
//    um array JSON cru com uma entrada em formato antigo (sem o campo `id`)
//    e prova que `peekAll()` descarta só a entrada inválida, preservando as
//    demais — o decode do array inteiro é atômico por padrão e uma única
//    entrada corrompida fazia a fila INTEIRA retornar vazia.
//
// Compilado junto com o arquivo REAL (sem mock, sem cópia):
//   swiftc modules/live-activity/ios/IntentActionQueue.swift \
//           scripts/IntentActionQueueConcurrencyTests/main.swift \
//           -o /tmp/iaq-concurrency-test
//
// Exit 0 = os dois testes passaram. Exit != 0 = o primeiro que falhar aborta
// e imprime FALHA. Cada teste limpa a chave do domínio ao final — um CLI no
// macOS não compartilha defaults com o simulador iOS, mas nenhum teste deixa
// resíduo mesmo assim.

import Foundation

let suite = "group.com.pmarconato.forcaapp.shared"
let key = "pendingLiveActivityIntentActions"

func falhar(_ mensagem: String) -> Never {
  FileHandle.standardError.write(Data("FALHA: \(mensagem)\n".utf8))
  exit(1)
}

// --- Teste 1: concorrência (WR-02) ------------------------------------

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

// --- Teste 2: decode elemento a elemento (IN-03) -----------------------
//
// Grava um array JSON CRU com 3 entradas — a do meio em formato antigo (sem
// o campo `id`, que QueuedIntentAction declara SEM default por design: o
// comentário do próprio struct exige que a omissão seja explícita, nunca
// mascarada). Antes do fix, `rawReadAll()` decodificava o array inteiro
// atomicamente: uma entrada inválida fazia `peekAll()` devolver [] — as 2
// entradas válidas (novas, legítimas) sumiam junto. Depois do fix,
// `rawReadAll()` cai para um decode elemento a elemento e descarta só a
// entrada inválida.
let jsonComEntradaEmFormatoAntigo = """
[
  {"kind":"adjustLoad","deltaSeconds":null,"deltaValue":2.5,"sessionLogId":"log-1","queuedAt":"2026-08-19T10:00:00.000Z","id":"id-valida-1"},
  {"kind":"completeSet","deltaSeconds":null,"deltaValue":null,"sessionLogId":null,"queuedAt":"2026-08-19T10:00:01.000Z"},
  {"kind":"skipRest","deltaSeconds":null,"deltaValue":null,"sessionLogId":"log-1","queuedAt":"2026-08-19T10:00:02.000Z","id":"id-valida-2"}
]
"""

guard let defaultsDecode = UserDefaults(suiteName: suite) else {
  falhar("não foi possível abrir UserDefaults do App Group \(suite) para o teste de decode")
}
defaultsDecode.set(Data(jsonComEntradaEmFormatoAntigo.utf8), forKey: key)

let sobreviventesDecode = IntentActionQueue.peekAll()
let idsDecode = Set(sobreviventesDecode.map(\.id))
let idsEsperadosDecode: Set<String> = ["id-valida-1", "id-valida-2"]

// Limpeza: remove só a chave gravada por este processo.
defaultsDecode.removeObject(forKey: key)
defaultsDecode.synchronize()

if idsDecode != idsEsperadosDecode {
  falhar(
    "decode elemento a elemento não preservou as entradas válidas: esperava "
      + "\(idsEsperadosDecode.sorted()), obteve \(sobreviventesDecode.count) "
      + "entrada(s) \(idsDecode.sorted()) — uma entrada em formato antigo "
      + "(sem \"id\") não pode descartar a fila inteira"
  )
}

print("OK: decode elemento a elemento preservou 2/3 entradas (1 em formato antigo descartada)")
