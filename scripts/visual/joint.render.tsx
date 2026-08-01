// scripts/visual/joint.render.tsx
// Treino Conjunto 2.0 — Sprint 02. Emite o HTML dos SETE cenários a partir dos
// COMPONENTES REAIS.
//
// Roda sob `jest.web.config.js`, onde `react-native` resolve para
// `react-native-web`. `AppRegistry.getApplication` devolve o elemento e o
// `<style>` que o RNW gerou — então o HTML carrega os estilos que os
// componentes realmente produzem, não uma folha escrita à mão.
//
// A rodada 1 entregou HTML manual espelhando os componentes. Parecia igual e
// não era: o falso positivo do lobby frio (F3) só existia no HTML, e a imagem
// "provava" uma tela que o produto não tinha.

import React from 'react';
import { AppRegistry, View } from 'react-native';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  JointEntryCard,
  JointIncompatibilidade,
  JointModePicker,
  JointMuscleGroupPicker,
  JointPartnerRow,
  JointReadyBar,
  JointSessionPicker,
} from '../../src/components/joint';
import { JointInviteCard } from '../../src/components/joint/JointInviteCard';
import { Card, Screen, SectionHeader } from '../../src/components/ui/Surface';
import { Notice } from '../../src/components/ui/Feedback';

const SAIDA = join(process.cwd(), 'artifacts', 'sprint-02', 'visual');
const T0 = Date.parse('2026-08-01T10:00:00.000Z');

const sessao = (id: string, title: string, grupos: string[]) => ({
  id, title, muscleGroups: grupos, status: 'pending', jointSessionId: null,
});

/** Renderiza um elemento REAL e devolve `{ html, css }` do react-native-web. */
const renderizar = (elemento: React.ReactElement) => {
  const nome = `Cenario${Math.random().toString(36).slice(2, 8)}`;
  AppRegistry.registerComponent(nome, () => () => elemento);
  const { element, getStyleElement } = (AppRegistry as any).getApplication(nome, {});
  return {
    html: renderToStaticMarkup(element),
    css: renderToStaticMarkup(getStyleElement()),
  };
};

const pagina = (titulo: string, estado: string, partes: { rotulo?: string; el: React.ReactElement }[], duplo = false) => {
  const blocos = partes.map((p) => {
    const { html, css } = renderizar(p.el);
    return { rotulo: p.rotulo, html, css };
  });
  const css = blocos.map((b) => b.css).join('\n');
  const corpo = blocos
    .map((b) => `<div class="bloco">${b.rotulo ? `<div class="rot">${b.rotulo}</div>` : ''}${b.html}</div>`)
    .join('');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title>
${css}
<style>
  html, body { margin:0; padding:0; background:#0B0B0C; }
  body { padding:16px; font-family: Inter, -apple-system, system-ui, sans-serif; }
  .rot { font-size:10px; letter-spacing:.1em; text-transform:uppercase;
         color:#8A8A90; margin:0 0 6px; }
  .grade { display:${duplo ? 'grid' : 'block'}; grid-template-columns:1fr 1fr; gap:16px;
           max-width:${duplo ? '768px' : '358px'}; }
  .bloco { margin-bottom:12px; }
  /* O RNW emite blocos que crescem; o viewport é de telefone. */
  .bloco > div { max-width:100%; }
  .cabecalho { font-size:10px; letter-spacing:.1em; text-transform:uppercase;
               color:#8A8A90; margin-bottom:12px; }
</style></head>
<body>
  <!-- Cenário: ${titulo} — Estado: ${estado} — componentes React Native reais via react-native-web -->
  <div class="cabecalho">${titulo} · ${estado}</div>
  <div class="grade">${corpo}</div>
</body></html>`;
};

const CENARIOS = [
  {
    id: 'a-home-com-treino-do-dia',
    titulo: 'Home — treino do dia e o cartão conjunto na posição real',
    estado: 'o treino do dia continua primeiro; Treinar junto logo depois',
    partes: [
      { rotulo: 'Treino do dia (bloco existente)', el: (
        <Card><SectionHeader title="Hoje" /><Notice tone="info" title="Peito A — semana 3" description="4 exercícios · 12 séries" /></Card>
      ) },
      { rotulo: 'Entrada do treino conjunto', el: (
        <JointEntryCard onCriar={() => {}} onEntrar={() => {}} />
      ) },
      { rotulo: 'Sua semana (bloco existente)', el: (
        <Card><SectionHeader title="Sua semana" /><Notice tone="info" title="2 de 4 treinos concluídos" /></Card>
      ) },
    ],
  },
  {
    id: 'b-criar-ou-entrar',
    titulo: 'Escolha — criar ou entrar',
    estado: 'nenhum convite criado; nada nasce de montagem',
    partes: [{ el: <JointEntryCard onCriar={() => {}} onEntrar={() => {}} /> }],
  },
  {
    id: 'c-host-aguardando',
    titulo: 'Anfitrião aguardando — código, link, relógio, compartilhar e rotação',
    estado: 'lobby frio reconstruído pela leitura host-only',
    partes: [{ el: (
      <JointInviteCard
        inviteCode="ABC234"
        inviteExpiresAt={new Date(T0 + 12 * 60_000).toISOString()}
        agoraMs={T0}
        emCurso={false}
        onCompartilhar={() => {}}
        onRotacionar={() => {}}
      />
    ) }],
  },
  {
    id: 'd-modo-host-e-guest',
    titulo: 'Modo escolhido — anfitrião (controle) × convidado (leitura)',
    estado: 'host_plan; só o anfitrião pode trocar',
    duplo: true,
    partes: [
      { rotulo: 'Anfitrião — controle', el: (
        <JointModePicker modo="host_plan" podeEscolher onEscolher={() => {}} />
      ) },
      { rotulo: 'Convidado — leitura', el: (
        <JointModePicker modo="host_plan" podeEscolher={false} onEscolher={() => {}} />
      ) },
    ],
  },
  {
    id: 'e-incompatibilidade-dois-papeis',
    titulo: 'Incompatibilidade — a saída depende do papel',
    estado: 'each_own com grupo Costas; nenhum lado vê a lista do outro',
    duplo: true,
    partes: [
      { rotulo: 'Anfitrião — controles reais', el: (
        <JointIncompatibilidade
          incompatibilidade={{ grupoPedido: 'Costas', meusGrupos: ['Peito', 'Pernas'], possoTrocar: true }}
          onTrocarGrupo={() => {}}
          onTrocarModo={() => {}}
        />
      ) },
      { rotulo: 'Convidado — orientação, sem controle', el: (
        <JointIncompatibilidade
          incompatibilidade={{ grupoPedido: 'Costas', meusGrupos: ['Ombro'], possoTrocar: false }}
        />
      ) },
    ],
  },
  {
    id: 'f-conexao-e-presenca',
    titulo: 'Conexão local × presença do parceiro',
    estado: 'três estados; sinais distintos',
    partes: [
      { rotulo: 'Conectado e presente', el: <JointPartnerRow nome="Ana" conexao="conectado" presenca="presente" /> },
      { rotulo: 'Canal caiu deste lado', el: <JointPartnerRow nome="Ana" conexao="reconectando" presenca="presente" /> },
      { rotulo: 'Parceiro ausente pelo TTL', el: <JointPartnerRow nome="Ana" conexao="conectado" presenca="ausente" /> },
    ],
  },
  {
    id: 'g-prontidao-e-handoff',
    titulo: 'Prontidão e handoff',
    estado: 'um pronto · ambos prontos · active sem player',
    partes: [
      { rotulo: 'Um pronto', el: (
        <JointReadyBar euPronto parceiroPronto={false} habilitado motivo="" emCurso={false} onAlternar={() => {}} />
      ) },
      { rotulo: 'Ambos prontos', el: (
        <JointReadyBar euPronto parceiroPronto habilitado motivo="" emCurso={false} onAlternar={() => {}} />
      ) },
      { rotulo: 'Handoff para o Sprint 03', el: (
        <Card>
          <Notice tone="info" title="Treino iniciado"
            description="A execução revezada chega na próxima etapa do app." />
        </Card>
      ) },
      { rotulo: 'Seleção da própria sessão', el: (
        <JointSessionPicker
          sessoes={[sessao('s1', 'Peito A', ['Peito']), sessao('s2', 'Pernas B', ['Pernas'])]}
          escolhida="s1"
          onEscolher={() => {}}
        />
      ) },
    ],
  },
];

describe('evidência visual — componentes reais', () => {
  it('emite os 7 HTML com markup e estilos do react-native-web', () => {
    mkdirSync(SAIDA, { recursive: true });
    for (const c of CENARIOS) {
      const html = pagina(c.titulo, c.estado, c.partes as any, (c as any).duplo);
      // Prova de que o markup veio do RNW, e não de HTML escrito à mão: o
      // react-native-web sempre emite classes `css-*` ou `r-*`.
      expect(html).toMatch(/class="(css|r)-/);
      writeFileSync(join(SAIDA, `${c.id}.html`), html, 'utf8');
    }
    expect(CENARIOS.length).toBe(7);
  });
});
