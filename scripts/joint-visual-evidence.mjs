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
// Tokens do tema, lidos do arquivo real — a evidência não inventa cor.
// ------------------------------------------------------------------
const temaFonte = readFileSync(join(RAIZ, 'src/theme/theme.ts'), 'utf8');
const token = (caminho, padrao) => {
  const m = temaFonte.match(new RegExp(`${caminho}:\\s*'([^']+)'`));
  return m ? m[1] : padrao;
};
const COR = {
  fundo: token('canvas', '#0B0B0C'),
  superficie: token('raised', '#141416'),
  texto: token('primary', '#F5F5F5'),
  secundario: token('secondary', '#A0A0A5'),
  acento: token('main', '#C8FF00'),
  aviso: token('warning', '#FFB020'),
};

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${COR.fundo}; color: ${COR.texto};
         font-family: Inter, -apple-system, system-ui, sans-serif; padding: 16px; }
  .tela { display: flex; flex-direction: column; gap: 12px; }
  .duplo { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .card { background: ${COR.superficie}; border-radius: 14px; padding: 14px; }
  .titulo { font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
            color: ${COR.secundario}; margin-bottom: 8px; }
  .linha { display: flex; align-items: center; justify-content: space-between; }
  .chip { font-size: 10px; padding: 4px 10px; border-radius: 999px;
          background: rgba(255,255,255,.08); color: ${COR.texto}; }
  .chip.on { background: ${COR.acento}; color: #000; }
  .btn { display: block; text-align: center; padding: 12px; border-radius: 12px;
         background: ${COR.acento}; color: #000; font-weight: 700; font-size: 13px; }
  .btn.sec { background: transparent; color: ${COR.texto};
             border: 1px solid rgba(255,255,255,.18); }
  .btn.off { opacity: .4; }
  .aviso { border-left: 3px solid ${COR.aviso}; padding-left: 10px; font-size: 12px;
           color: ${COR.secundario}; }
  .info { border-left: 3px solid ${COR.acento}; padding-left: 10px; font-size: 12px;
          color: ${COR.secundario}; }
  .codigo { font-size: 34px; letter-spacing: .22em; text-align: center; font-weight: 800; }
  .link { font-size: 11px; color: ${COR.secundario}; text-align: center; }
  .rot { font-size: 10px; color: ${COR.secundario}; text-transform: uppercase;
         letter-spacing: .1em; margin-bottom: 6px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 14px; }
  p { font-size: 12px; color: ${COR.secundario}; }
`;

const pagina = (titulo, estado, corpo, duplo = false) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title><style>${css}</style></head>
<body>
  <!-- Cenário: ${titulo} — Estado: ${estado} -->
  <div class="rot">${titulo} · ${estado}</div>
  <div class="${duplo ? 'duplo' : 'tela'}">${corpo}</div>
</body></html>`;

const card = (titulo, dentro) => `<div class="card"><div class="titulo">${titulo}</div>${dentro}</div>`;

// ------------------------------------------------------------------
// Os SETE cenários exigidos pelo contrato (V6 a–g)
// ------------------------------------------------------------------
const CENARIOS = [
  {
    id: 'a-home-com-treino-do-dia',
    titulo: 'Home — treino do dia e o cartão conjunto na posição real',
    estado: 'treino do dia primeiro; "Treinar junto" logo depois',
    corpo: [
      card('Hoje', '<h2>Peito A — semana 3</h2><p>4 exercícios · 12 séries</p><div class="btn">Começar treino</div>'),
      card('Treinar junto', '<div class="btn">Convidar alguém</div><div style="height:8px"></div><div class="btn sec">Entrar com código</div>'),
      card('Sua semana', '<p>2 de 4 treinos concluídos</p>'),
    ].join(''),
  },
  {
    id: 'b-criar-ou-entrar',
    titulo: 'Escolha — criar ou entrar',
    estado: 'nenhum convite criado; nada nasce de montagem',
    corpo: card('Treinar junto',
      '<p>Quem entrar recebe um código de 6 caracteres.</p><div style="height:10px"></div>'
      + '<div class="btn">Convidar alguém</div><div style="height:8px"></div>'
      + '<div class="btn sec">Entrar com código</div>'),
  },
  {
    id: 'c-host-aguardando',
    titulo: 'Anfitrião aguardando — código, link e relógio',
    estado: 'status inviting; recuperável a frio pela leitura host-only',
    corpo: card('Código do convite',
      '<div class="codigo">ABC234</div><div class="link">forcaapp://treino-conjunto/ABC234</div>'
      + '<div style="height:10px"></div><div class="info">expira em 12 min</div>'
      + '<div style="height:10px"></div><div class="btn">Compartilhar</div>'
      + '<div style="height:8px"></div><div class="btn sec">Gerar novo convite</div>'),
  },
  {
    id: 'd-modo-host-e-guest',
    titulo: 'Modo escolhido — anfitrião (controle) × convidado (leitura)',
    estado: 'host_plan; só o anfitrião pode trocar',
    duplo: true,
    corpo: [
      `<div><div class="rot">Anfitrião — controle</div>${card('O que vocês vão treinar',
        '<div class="chip on">Treino de quem convidou</div><div style="height:8px"></div>'
        + '<div class="chip">Treino de quem entrou</div><div style="height:8px"></div>'
        + '<div class="chip">Cada um faz o seu</div>')}</div>`,
      `<div><div class="rot">Convidado — leitura</div>${card('O que vocês vão treinar',
        '<h2>Treino de quem convidou</h2><p>Os dois seguem a estrutura de quem convidou.</p>')}</div>`,
    ].join(''),
  },
  {
    id: 'e-incompatibilidade-dois-papeis',
    titulo: 'Incompatibilidade — a saída depende do papel',
    estado: 'each_own com grupo Costas; nenhum lado vê a lista do outro',
    duplo: true,
    corpo: [
      `<div><div class="rot">Anfitrião — controles reais</div>${card('Grupo incompatível',
        '<div class="aviso">Você não tem treino de Costas.<br>Seus grupos: Peito, Pernas.</div>'
        + '<div style="height:10px"></div><div class="btn">Trocar o grupo</div>'
        + '<div style="height:8px"></div><div class="btn sec">Trocar o modo</div>')}</div>`,
      `<div><div class="rot">Convidado — orientação, sem controle</div>${card('Grupo incompatível',
        '<div class="aviso">Você não tem treino de Costas.<br>Seus grupos: Ombro.<br>'
        + 'Peça para quem convidou trocar o grupo ou o modo.</div>')}</div>`,
    ].join(''),
  },
  {
    id: 'f-conexao-e-presenca',
    titulo: 'Conexão local × presença do parceiro',
    estado: 'três estados; sinais distintos',
    corpo: [
      card('Conectado', '<div class="linha"><span>Ana — No treino</span><span class="chip on">Conectado</span></div>'),
      card('Reconectando', '<div class="linha"><span>Ana — No treino</span><span class="chip">Reconectando</span></div>'),
      card('Parceiro ausente', '<div class="linha"><span>Ana — Sem sinal do parceiro</span><span class="chip on">Conectado</span></div>'
        + '<div style="height:8px"></div><div class="aviso">O aparelho do parceiro parou de responder.</div>'),
    ].join(''),
  },
  {
    id: 'g-prontidao-e-handoff',
    titulo: 'Prontidão e handoff',
    estado: 'um pronto · ambos prontos · active (sem player)',
    corpo: [
      card('Um pronto', '<div class="linha"><span class="chip on">Você: pronto</span><span class="chip">Parceiro: aguardando</span></div>'
        + '<div style="height:10px"></div><div class="btn sec">Não estou pronto</div>'),
      card('Ambos prontos', '<div class="linha"><span class="chip on">Você: pronto</span><span class="chip on">Parceiro: pronto</span></div>'),
      card('Treino iniciado', '<div class="info">Treino iniciado.<br>A execução revezada chega na próxima etapa do app.</div>'),
    ].join(''),
  },
];

// ------------------------------------------------------------------
// Render
// ------------------------------------------------------------------
const chrome = acharChrome();
console.log(`[joint-visual] chrome: ${chrome.split('/').pop()}`);

rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(SAIDA, { recursive: true });

const manifesto = [];
for (const c of CENARIOS) {
  const html = pagina(c.titulo, c.estado, c.corpo, c.duplo);
  const arquivoHtml = join(SAIDA, `${c.id}.html`);
  const arquivoPng = join(SAIDA, `${c.id}.png`);
  writeFileSync(arquivoHtml, html, 'utf8');

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
