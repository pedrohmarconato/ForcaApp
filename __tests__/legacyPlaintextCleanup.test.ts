// __tests__/legacyPlaintextCleanup.test.ts
// Contrato da limpeza de cópia legada em texto puro:
//
// 1. No NATIVO ela delega ao AsyncStorage.removeItem (o legado real existe lá).
// 2. Nenhum arquivo do fluxo questionário/chat pode chamar
//    AsyncStorage.removeItem direto para chave que também vive no storage
//    seguro — no web isso apaga o dado recém-gravado (bug de 22/07/2026:
//    "Dados do questionário não encontrados" ao entrar no chat, e o estado
//    do chat se auto-apagava a cada save).

import { readFileSync } from 'fs';
import { join } from 'path';

const mockAsyncRemoveItem = jest.fn(async (_k: string): Promise<void> => undefined);
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: (k: string) => mockAsyncRemoveItem(k),
  },
}));

import { removeLegacyPlaintextCopy } from '../src/services/auth/secureStorage';

describe('removeLegacyPlaintextCopy — nativo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('delega ao AsyncStorage.removeItem (a cópia legada nativa existe de verdade)', async () => {
    await removeLegacyPlaintextCopy('@questionnaire_data_user-1');
    expect(mockAsyncRemoveItem).toHaveBeenCalledWith('@questionnaire_data_user-1');
  });

  it('é best-effort: falha do AsyncStorage não propaga', async () => {
    mockAsyncRemoveItem.mockRejectedValueOnce(new Error('storage indisponível'));
    await expect(removeLegacyPlaintextCopy('chave')).resolves.toBeUndefined();
  });
});

describe('varredura — nenhum removeItem cru de chave segura no fluxo questionário/chat', () => {
  const ARQUIVOS = [
    'src/screens/QuestionnaireScreen.tsx',
    'src/screens/PostQuestionnaireChat.tsx',
    'src/services/postQuestionnaireChatStorage.ts',
  ];
  // Única chave que vive SÓ no AsyncStorage (preferência legada, nunca no
  // storage seguro) — removê-la direto é inofensivo em qualquer plataforma.
  const EXCECOES = ["'@userShouldStayLoggedIn'"];

  it.each(ARQUIVOS)('%s usa removeLegacyPlaintextCopy em vez de AsyncStorage.removeItem', (arquivo) => {
    const conteudo = readFileSync(join(__dirname, '..', arquivo), 'utf8');
    const chamadas: string[] = conteudo.match(/AsyncStorage\.removeItem\([^)]*\)/g) ?? [];
    const proibidas = chamadas.filter((c) => !EXCECOES.some((ok) => c.includes(ok)));
    expect(proibidas).toEqual([]);
  });
});
