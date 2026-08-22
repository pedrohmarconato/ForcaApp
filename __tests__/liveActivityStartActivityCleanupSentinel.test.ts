// __tests__/liveActivityStartActivityCleanupSentinel.test.ts
//
// Sentinela estática: prova que `startActivity` em
// modules/live-activity/ios/LiveActivityModule.swift SEMPRE encerra, antes
// de criar a Activity nova, toda Activity existente cujo
// `attributes.sessionLogId` seja DIFERENTE do sessionLogId novo.
//
// Por que existe (Item A, revisão 2026-08-22, WINDOWS.md #6): desde que o
// caminho de ERRO de iniciar() passou a preservar o card em falha
// TRANSITÓRIA (só encerra em PGRST116 — sessão genuinamente inexistente na
// base; ver isSessionNotFoundError em ActiveSessionScreen.tsx), um card
// órfão de OUTRA sessão pode sobreviver ao caminho de erro e ficar pendente
// até o próximo cold boot (reconcileOrphans é o backstop final). O caminho
// de SUCESSO de startActivity passou a ser quem recolhe esse órfão sem
// esperar o cold boot — reutilizando o mesmo mecanismo de encerramento do
// reconcileOrphans (`activity.end(nil, dismissalPolicy: .immediate)`), só
// que filtrado por sessionLogId diferente. Sem este sentinela, uma futura
// edição em startActivity poderia remover esse laço em silêncio e
// reintroduzir o card alheio preso na tela bloqueada.
//
// Técnica: lê o arquivo Swift como texto, extrai o corpo do closure de
// `AsyncFunction("startActivity") { ... }` (do marcador até o próximo
// `AsyncFunction(` do arquivo — não o arquivo inteiro, para não dar falso
// positivo com reconcileOrphans, que também encerra Activities mas SEM
// filtro de sessionLogId) e verifica que esse corpo contém um laço sobre
// `Activity<SessionActivityAttributes>.activities` filtrado por
// `sessionLogId != sessionLogId` (o novo), seguido de uma chamada de
// encerramento.

import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..');
const modulePath = join(
  repoRoot,
  'modules/live-activity/ios/LiveActivityModule.swift',
);

const ler = (): string => readFileSync(modulePath, 'utf8');

/**
 * Extrai o corpo de um bloco `AsyncFunction("<nome>") { ... }` — do
 * marcador de abertura até o próximo `AsyncFunction(` do arquivo (ou o fim
 * do arquivo, se for o último bloco). Não depende de balancear chaves: cada
 * bloco desta classe é top-level dentro de `definition()`, então o próximo
 * `AsyncFunction(` é sempre o limite certo.
 */
const extrairCorpoDoBloco = (src: string, nomeFuncao: string): string => {
  const marcador = `AsyncFunction("${nomeFuncao}")`;
  const inicio = src.indexOf(marcador);
  if (inicio === -1) {
    throw new Error(`${marcador} não encontrado no arquivo`);
  }
  const resto = src.slice(inicio + marcador.length);
  const proximoBloco = resto.indexOf('AsyncFunction(');
  return proximoBloco === -1 ? resto : resto.slice(0, proximoBloco);
};

/**
 * Âncora textual robusta: um laço sobre
 * `Activity<SessionActivityAttributes>.activities` com condição filtrando
 * por sessionLogId DIFERENTE do novo, seguido (nas linhas seguintes) por
 * uma chamada de encerramento (`.end(`) — o mesmo mecanismo usado por
 * reconcileOrphans. Tolerante a quebra de linha entre `.activities` e o
 * `where`, e a `!=` com ou sem espaço.
 */
const contemLimpezaDeOutraSessao = (corpo: string): boolean => {
  const regexLaco =
    /for\s+activity\s+in\s+Activity<SessionActivityAttributes>\.activities[\s\S]{0,80}?sessionLogId\s*!=\s*sessionLogId[\s\S]{0,120}?\.end\(/;
  return regexLaco.test(corpo);
};

describe('sentinela: startActivity encerra Activities de OUTRA sessão antes de criar a nova', () => {
  it('LiveActivityModule.swift contém o laço filtrado de encerramento (sessionLogId != sessionLogId novo) dentro de startActivity', () => {
    const corpo = extrairCorpoDoBloco(ler(), 'startActivity');
    expect(contemLimpezaDeOutraSessao(corpo)).toBe(true);
  });

  it('a extração isola startActivity de reconcileOrphans — reconcileOrphans encerra SEM filtro e não deve, sozinho, satisfazer a âncora', () => {
    // reconcileOrphans usa o mesmo `.end(nil, dismissalPolicy: .immediate)`
    // mas SEM condição de sessionLogId — comportamento intencional (nuke
    // tudo no cold boot; o parâmetro nem se chama `sessionLogId`, e sim
    // `stillActiveSessionLogId`). Prova de não-trivialidade: o corpo do
    // reconcileOrphans isolado não deve casar com a âncora exigida em
    // startActivity, senão a âncora valeria por vacuidade.
    const corpoReconcile = extrairCorpoDoBloco(ler(), 'reconcileOrphans');
    expect(contemLimpezaDeOutraSessao(corpoReconcile)).toBe(false);
  });

  it('distingue corpo com o laço filtrado de corpo sem ele (prova que o sentinela pegaria a regressão)', () => {
    const comLaco = `
      guard #available(iOS 16.2, *) else { return false }
      for activity in Activity<SessionActivityAttributes>.activities
      where activity.attributes.sessionLogId != sessionLogId {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      let attributes = SessionActivityAttributes(sessionLogId: sessionLogId)
    `;
    expect(contemLimpezaDeOutraSessao(comLaco)).toBe(true);

    // Regressão real que este sentinela pegaria: o laço removido, criando a
    // Activity nova direto — exatamente o bug original ("startActivity
    // limpa cards alheios" deixando de limpar).
    const semLaco = `
      guard #available(iOS 16.2, *) else { return false }
      let attributes = SessionActivityAttributes(sessionLogId: sessionLogId)
    `;
    expect(contemLimpezaDeOutraSessao(semLaco)).toBe(false);
  });
});
