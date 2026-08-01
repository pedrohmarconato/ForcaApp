// scripts/joint-visual-evidence.mjs
// Treino Conjunto 2.0 — Sprint 02. Evidência visual dos estados do lobby.
//
//   node scripts/joint-visual-evidence.mjs
//
// Gera, para cada um dos SETE cenários: um HTML fonte, um PNG renderizado por
// Chrome headless e uma entrada no manifesto. O `out-dir` é limpo e recriado a
// cada execução — um artefato velho sobrevivendo daria a impressão de cobertura
// que a rodada não produziu.
//
// FALHA FECHADA: sem Chrome, sem `CHROME_BIN` ou com render parcial, o processo
// sai com código diferente de zero. Terminar verde só com markup seria dizer
// "tem evidência visual" mostrando um arquivo que ninguém consegue ver.
//
// Determinístico e offline: nada de rede, relógio fixo, dados injetados.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const RAIZ = resolve(process.cwd());
const SAIDA = join(RAIZ, 'artifacts', 'sprint-02', 'visual');
const VIEWPORT = { largura: 390, altura: 844 };          // telefone
const VIEWPORT_DUPLO = { largura: 800, altura: 844 };    // host × guest lado a lado

const CHROMES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);

const abortar = (mensagem) => {
  console.error(`\n[joint-visual] FALHOU: ${mensagem}\n`);
  process.exit(1);
};

const acharChrome = () => {
  for (const c of CHROMES) if (existsSync(c)) return c;
  abortar(
    'Chrome headless não encontrado. Defina CHROME_BIN ou instale o Chrome. '
    + 'Sem navegador não há PNG, e HTML sozinho não é evidência visual.',
  );
};

// ------------------------------------------------------------------
// O HTML vem do RENDER DOS COMPONENTES REAIS
// ------------------------------------------------------------------
// A rodada 1 escrevia HTML/CSS à mão espelhando os componentes. Parecia igual e
// não era: a imagem mostrava um lobby com link, relógio e botões que a tela não
// tinha. Agora `jest.web.config.js` roda os componentes sob `react-native-web`
// e emite markup + estilos REAIS; aqui só se confere e se fotografa.

const CENARIOS = [
  { id: 'a-home-com-treino-do-dia', duplo: false },
  { id: 'b-criar-ou-entrar', duplo: false },
  { id: 'c-host-aguardando', duplo: false },
  { id: 'd-modo-host-e-guest', duplo: true },
  { id: 'e-incompatibilidade-dois-papeis', duplo: true },
  { id: 'f-conexao-e-presenca', duplo: false },
  { id: 'g-prontidao-e-handoff', duplo: false },
];

// ------------------------------------------------------------------
// Render
// ------------------------------------------------------------------
const chrome = acharChrome();
console.log(`[joint-visual] chrome: ${chrome.split('/').pop()}`);

rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(SAIDA, { recursive: true });

// Render dos componentes reais. Falha aqui = sem evidência; nada de seguir com
// markup velho ou escrito à mão.
console.log('[joint-visual] renderizando componentes reais (react-native-web)…');
try {
  execFileSync('npx', ['jest', '-c', 'jest.web.config.js', '--silent'], {
    cwd: RAIZ, stdio: 'pipe', timeout: 300_000,
  });
} catch (e) {
  abortar(`o render dos componentes reais falhou: ${e.stderr?.toString?.().slice(-400) ?? e.message}`);
}

const manifesto = [];
for (const c of CENARIOS) {
  const arquivoHtml = join(SAIDA, `${c.id}.html`);
  const arquivoPng = join(SAIDA, `${c.id}.png`);
  if (!existsSync(arquivoHtml)) abortar(`HTML de ${c.id} não foi gerado pelo render`);

  const html = readFileSync(arquivoHtml, 'utf8');
  // Trava contra o retorno do HTML manual: o react-native-web sempre emite
  // classes `css-*`/`r-*`. Sem elas, isto não é render de componente.
  if (!/class="(css|r)-/.test(html)) {
    abortar(`${c.id}.html não tem marcas do react-native-web — é markup manual`);
  }

  const vp = c.duplo ? VIEWPORT_DUPLO : VIEWPORT;
  try {
    execFileSync(chrome, [
      '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      `--screenshot=${arquivoPng}`,
      `--window-size=${vp.largura},${vp.altura}`,
      `file://${arquivoHtml}`,
    ], { stdio: 'pipe', timeout: 60_000 });
  } catch (e) {
    abortar(`Chrome não renderizou ${c.id}: ${e.message}`);
  }

  if (!existsSync(arquivoPng)) abortar(`PNG não foi gerado para ${c.id}`);
  const tamanho = statSync(arquivoPng).size;
  if (tamanho < 1000) abortar(`PNG de ${c.id} está vazio (${tamanho} bytes) — render parcial`);

  manifesto.push({
    id: c.id, titulo: c.titulo, estado: c.estado,
    viewport: `${vp.largura}x${vp.altura}`,
    html: `${c.id}.html`, png: `${c.id}.png`, bytesPng: tamanho,
  });
  console.log(`[joint-visual] ${c.id} — ${tamanho} bytes, ${vp.largura}x${vp.altura}`);
}

if (manifesto.length !== 7) abortar(`gerou ${manifesto.length} cenários, esperado 7`);

writeFileSync(
  join(SAIDA, 'manifesto.json'),
  JSON.stringify({ sprint: '02', cenarios: manifesto }, null, 2),
  'utf8',
);

console.log(`\n[joint-visual] OK — 7 cenários em ${SAIDA}`);
console.log('[joint-visual] abra os PNG; o HTML fonte e o manifesto estão ao lado.\n');
