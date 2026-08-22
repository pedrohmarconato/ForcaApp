// __tests__/liveActivityIntentDeltaSentinel.test.ts
//
// Sentinela estática: prova que o evento quente `sendEvent("onIntentAction",
// ...)` de cada Intent com delta em modules/live-activity/ios/ SEMPRE inclui
// a chave de delta correspondente no dicionário do evento.
//
// Por que existe: o bug confirmado nesta correção — AdjustRepsIntent.swift,
// AdjustLoadIntent.swift e AdjustRestIntent.swift enfileiravam o delta certo
// na fila durável (`IntentActionQueue.enqueue`), mas o `sendEvent` do evento
// quente in-process OMITIA o campo. Do lado JS, `liveActivityIntentBridge.ts`
// tratava o campo ausente como "-1" (ex.: `event.deltaReps > 0 ? 1 : -1` com
// `undefined` sempre cai em `-1`), decrementando reps/carga a cada toque —
// inclusive toques de "+". A guarda em `liveActivityIntentBridge.ts`
// (Number.isFinite) cobre o runtime hoje, mas sem este sentinela nada impede
// uma futura edição no `sendEvent` de reintroduzir a omissão em silêncio.
//
// Técnica: lê cada arquivo Swift como texto, localiza a chamada
// `sendEvent("onIntentAction", [...])` (o dicionário do evento, não o
// enqueue da fila durável) e verifica que a chave de delta esperada aparece
// DENTRO desse dicionário — não em qualquer lugar do arquivo (evitaria falso
// positivo de um comentário mencionando a chave).

import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..');
const iosDir = join(repoRoot, 'modules/live-activity/ios');

const ler = (arquivo: string): string => readFileSync(join(iosDir, arquivo), 'utf8');

/**
 * Extrai o literal de dicionário passado a
 * `sendEvent("onIntentAction", [...])`. Não-guloso até o primeiro `])` — o
 * dicionário não tem `[...]` aninhado em nenhum dos três Intents, então o
 * primeiro fechamento é sempre o correto.
 */
const extrairDicionarioDoSendEvent = (src: string): string => {
  const chamada = src.match(/sendEvent\("onIntentAction",\s*\[([\s\S]*?)\]\)/);
  if (!chamada) {
    throw new Error('sendEvent("onIntentAction", ...) não encontrado no arquivo');
  }
  return chamada[1];
};

const CASOS = [
  { arquivo: 'AdjustRepsIntent.swift', chaveDelta: 'deltaReps' },
  { arquivo: 'AdjustLoadIntent.swift', chaveDelta: 'deltaLoadKg' },
  { arquivo: 'AdjustRestIntent.swift', chaveDelta: 'deltaSeconds' },
] as const;

describe('sentinela: sendEvent("onIntentAction", ...) nunca omite a chave de delta', () => {
  it.each(CASOS)(
    '$arquivo inclui "$chaveDelta" no dicionário do evento quente',
    ({ arquivo, chaveDelta }) => {
      const dicionario = extrairDicionarioDoSendEvent(ler(arquivo));
      expect(dicionario).toMatch(new RegExp(`"${chaveDelta}"\\s*:\\s*${chaveDelta}\\b`));
    },
  );

  it('o enqueue (fila durável) e o sendEvent (evento quente) concordam sobre existir um delta — não é só a fila que carrega o valor', () => {
    for (const { arquivo, chaveDelta } of CASOS) {
      const src = ler(arquivo);
      // A fila durável usa `deltaValue`/`deltaSeconds` no QueuedIntentAction,
      // não o nome do parâmetro Swift — aqui só confirmamos que o parâmetro
      // (ex.: `deltaReps`) é referenciado tanto no enqueue quanto no
      // sendEvent, ou seja, os dois caminhos partem do MESMO valor de
      // entrada, nunca de um valor inventado à parte.
      const referenciasAoParametro = src.match(new RegExp(`\\b${chaveDelta}\\b`, 'g')) ?? [];
      // @Parameter var + init(...) + uso no enqueue + uso no sendEvent = pelo
      // menos 4 ocorrências do identificador no arquivo inteiro.
      expect(referenciasAoParametro.length).toBeGreaterThanOrEqual(4);
    }
  });

  // Verificação de não-trivialidade da própria técnica: a extração precisa
  // FALHAR a asserção quando a chave está ausente do dicionário (senão a
  // guarda vale por vacuidade) e PASSAR quando está presente — prova que o
  // sentinela detectaria a regressão exata que o bug real produziu.
  it('distingue dicionário com a chave de delta de dicionário sem ela (prova que o sentinela pegaria a regressão)', () => {
    const comChave = extrairDicionarioDoSendEvent(
      'LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "adjustReps", "deltaReps": deltaReps, "id": actionId])',
    );
    expect(comChave).toMatch(/"deltaReps"\s*:\s*deltaReps\b/);

    // Payload real do bug de hoje: sendEvent sem a chave de delta.
    const semChave = extrairDicionarioDoSendEvent(
      'LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "adjustReps", "id": actionId])',
    );
    expect(semChave).not.toMatch(/"deltaReps"\s*:\s*deltaReps\b/);
  });
});
