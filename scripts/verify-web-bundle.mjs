// Trava de deploy do PWA: falha o build se o bundle exportado não aponta para
// a API de produção ou se algum endereço de LAN vazou para o JS publicado.
// Roda encadeada no buildCommand do vercel.json — se as EXPO_PUBLIC_* não
// estiverem no ambiente do build (painel da Vercel ou .env do prebuilt), o
// deploy quebra AQUI, e não silenciosamente na mão do usuário.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const PROD_API_HOST = 'forca-api.cadastrai.com';
const LAN_PATTERN = /192\.168\.\d{1,3}\.\d{1,3}/;

const raiz = join(process.cwd(), 'dist');

const listarJs = (dir) => {
  let arquivos = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivos = arquivos.concat(listarJs(caminho));
    } else if (nome.endsWith('.js')) {
      arquivos.push(caminho);
    }
  }
  return arquivos;
};

let bundles;
try {
  bundles = listarJs(raiz);
} catch {
  console.error('verify-web-bundle: dist/ não existe — rode `npx expo export -p web` antes.');
  process.exit(1);
}

if (bundles.length === 0) {
  console.error('verify-web-bundle: nenhum .js em dist/ — export incompleto.');
  process.exit(1);
}

// A CSP do vercel.json usa script-src 'self' SEM 'unsafe-eval'. O loader de
// split-bundle do Metro usa eval() — hoje é código morto porque o export gera
// UM único bundle. Se aparecer code-splitting, a CSP precisa ser revisada
// junto; este guard força essa conversa em vez de quebrar em produção.
const principais = bundles.filter((f) => f.includes(join('_expo', 'static', 'js')));
if (principais.length > 1) {
  console.error(
    'verify-web-bundle: mais de um bundle JS em _expo/static/js — code-splitting ' +
      "ativo exige revisar a CSP (script-src sem 'unsafe-eval'): " +
      principais.join(', '),
  );
  process.exit(1);
}

let temProducao = false;
const comLan = [];
for (const arquivo of bundles) {
  const conteudo = readFileSync(arquivo, 'utf8');
  if (conteudo.includes(PROD_API_HOST)) temProducao = true;
  if (LAN_PATTERN.test(conteudo)) comLan.push(arquivo);
}

if (!temProducao) {
  console.error(
    `verify-web-bundle: nenhum bundle contém ${PROD_API_HOST} — ` +
      'EXPO_PUBLIC_API_BASE_URL ausente ou errada no ambiente do build.',
  );
  process.exit(1);
}
if (comLan.length > 0) {
  console.error(
    'verify-web-bundle: endereço de LAN (192.168.x.x) vazou para o bundle: ' +
      comLan.join(', '),
  );
  process.exit(1);
}
console.log(`verify-web-bundle: OK — bundle aponta para ${PROD_API_HOST}, sem endereços de LAN.`);
