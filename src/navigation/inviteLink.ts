// src/navigation/inviteLink.ts
// Treino Conjunto 2.0 — Sprint 02. As funções PURAS do link de convite.
//
// Separadas de `linking.ts` de propósito: aquele módulo precisa do
// armazenamento do convite pendente, e portanto do AsyncStorage. Uma tela que
// só quer montar o link não deve arrastar storage nativo junto — foi o que
// aconteceu na primeira versão, e quebrou o teste de tela.

/** Alfabeto do código, idêntico ao de `_forca_joint_codigo_novo` na 0026. */
export const ALFABETO_CONVITE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALFABETO = ALFABETO_CONVITE;
const TAMANHO = 6;

export const SCHEME = 'forcaapp';
export const CAMINHO_CONVITE = 'treino-conjunto';

export const PREFIXOS = [`${SCHEME}://`];

/** O código é válido? Tamanho e alfabeto exatos — `O`, `0`, `I` e `1` ficam fora. */
export const isCodigoDeConvite = (valor: unknown): valor is string => {
  if (typeof valor !== 'string' || valor.length !== TAMANHO) return false;
  for (const c of valor) if (!ALFABETO.includes(c)) return false;
  return true;
};

/** Link canônico do convite. É o que a tela mostra e o que o Share envia. */
export const buildInviteLink = (codigo: string): string =>
  `${SCHEME}://${CAMINHO_CONVITE}/${codigo}`;

/**
 * Valida a URI COMPLETA e devolve o código, ou null.
 *
 * Confere scheme, host/caminho, tamanho, alfabeto e ausência de query e
 * fragment. Query e fragment são recusados de propósito: o convite não tem
 * parâmetro nenhum, então a presença deles indica um link forjado ou remontado
 * por terceiro — e aceitar "o que dá para aproveitar" de um link estranho é
 * como se abre porta.
 *
 * `getStateFromPath` do React Navigation recebe PATH, não URI. Por isso a
 * validação de scheme mora aqui, e não lá.
 */
export const parseInviteUrl = (url: unknown): string | null => {
  if (typeof url !== 'string' || url.length === 0) return null;
  // Sem `new URL`: em RN o polyfill varia, e um scheme custom nem sempre parseia
  // de forma previsível. A comparação literal é mais estrita e mais legível.
  const prefixo = `${SCHEME}://`;
  if (!url.startsWith(prefixo)) return null;

  const resto = url.slice(prefixo.length);
  if (resto.includes('?') || resto.includes('#')) return null;

  const partes = resto.split('/').filter((p) => p.length > 0);
  if (partes.length !== 2) return null;
  if (partes[0] !== CAMINHO_CONVITE) return null;

  const codigo = partes[1].toUpperCase();
  return isCodigoDeConvite(codigo) ? codigo : null;
};

/** Mesma validação, a partir do PATH que o React Navigation entrega. */
export const parseInvitePath = (path: unknown): string | null => {
  if (typeof path !== 'string') return null;
  const limpo = path.replace(/^\//, '');
  if (limpo.includes('?') || limpo.includes('#')) return null;
  const partes = limpo.split('/').filter((p) => p.length > 0);
  if (partes.length !== 2 || partes[0] !== CAMINHO_CONVITE) return null;
  const codigo = partes[1].toUpperCase();
  return isCodigoDeConvite(codigo) ? codigo : null;
};

