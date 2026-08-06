// src/components/joint/index.tsx
// Treino Conjunto 2.0 — Sprint 02. Peças visuais do convite e do lobby.
//
// REGRA DESTE DIRETÓRIO: tudo que é visual vem de `src/components/ui`. `View` e
// `StyleSheet` aparecem só para LAYOUT — nenhum literal de cor, fonte, raio ou
// espaçamento mora aqui. Quando um componente precisa de um valor de design, ele
// vem de `theme`, nunca de um número solto no meio do arquivo.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import theme from '../../theme/theme';
import { Button } from '../ui';
import { Card, ListRow, SectionHeader } from '../ui/Surface';
import { Chip, EmptyState, Notice } from '../ui/Feedback';
import { OptionButton } from '../ui/Controls';
import {
  JOINT_MODE_LABELS,
  type JointMode,
} from '../../engine/jointSessionModel';
export { JointInviteCard, tempoRestante } from './JointInviteCard';

import type {
  ConexaoLocal,
  Incompatibilidade,
  PresencaDoParceiro,
  SessaoElegivel,
} from '../../engine/jointLobbyModel';

const layout = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  colunaCurta: { gap: theme.spacing.xs },
  coluna: { gap: theme.spacing.sm },
  cheio: { flex: 1 },
});

// ============================================================
// Entrada na Home
// ============================================================

/**
 * O cartão que torna o treino conjunto descobrível. Ele ABRE A ESCOLHA — não
 * cria convite. Um cartão que gerasse convite ao ser tocado produziria sessões
 * fantasma toda vez que alguém encostasse nele por engano.
 */
export const JointEntryCard = ({
  onCriar,
  onEntrar,
}: {
  onCriar: () => void;
  onEntrar: () => void;
}) => (
  <Card testID="card-treino-conjunto">
    <SectionHeader title="Treinar junto" />
    <View style={layout.coluna}>
      <Button
        label="Convidar alguém"
        onPress={onCriar}
      />
      <Button
        label="Entrar com código"
        variant="outline"
        onPress={onEntrar}
      />
    </View>
  </Card>
);

// ============================================================
// Parceiro, conexão e presença
// ============================================================

const ROTULO_PRESENCA: Record<PresencaDoParceiro, string> = {
  presente: 'No treino',
  ausente: 'Sem sinal do parceiro',
  desconhecida: 'Aguardando',
};

/**
 * Identidade mínima do parceiro e os DOIS sinais separados: a conexão deste
 * aparelho e a presença do outro. Juntá-los num indicador só faria "meu wifi
 * caiu" e "meu parceiro sumiu" virarem a mesma frase.
 */
export const JointPartnerRow = ({
  nome,
  conexao,
  presenca,
}: {
  nome: string | null;
  conexao: ConexaoLocal;
  presenca: PresencaDoParceiro;
}) => (
  <Card>
    <View style={layout.linha}>
      <View style={layout.cheio}>
        <ListRow title={nome ?? 'Parceiro'} subtitle={ROTULO_PRESENCA[presenca]} />
      </View>
      <Chip
        label={conexao === 'conectado' ? 'Conectado' : 'Reconectando'}
        tone={conexao === 'conectado' ? 'accent' : 'info'}
      />
    </View>
  </Card>
);

// ============================================================
// Modo
// ============================================================

const EXPLICACAO_MODO: Record<JointMode, string> = {
  host_plan: 'Os dois seguem a estrutura de quem convidou.',
  guest_plan: 'Os dois seguem a estrutura de quem entrou.',
  each_own: 'Cada um faz o próprio treino, do mesmo grupo muscular.',
};

/**
 * Só o anfitrião escolhe. Para o convidado isto vira leitura — mostrar um
 * controle que a RPC recusa seria prometer o que não se cumpre.
 */
export const JointModePicker = ({
  modo,
  podeEscolher,
  onEscolher,
}: {
  modo: JointMode | null;
  podeEscolher: boolean;
  onEscolher: (m: JointMode) => void;
}) => {
  const modos: JointMode[] = ['host_plan', 'guest_plan', 'each_own'];
  if (!podeEscolher) {
    return (
      <Card testID="modo-leitura">
        <SectionHeader title="O que vocês vão treinar" />
        <ListRow
          title={modo ? JOINT_MODE_LABELS[modo] : 'Quem convidou está escolhendo'}
          subtitle={modo ? EXPLICACAO_MODO[modo] : undefined}
        />
      </Card>
    );
  }
  return (
    <Card testID="modo-escolha">
      <SectionHeader title="O que vocês vão treinar" />
      <View style={layout.coluna}>
        {modos.map((m) => (
          <OptionButton
            key={m}
            testID={`modo-${m}`}
            label={`${JOINT_MODE_LABELS[m]} — ${EXPLICACAO_MODO[m]}`}
            selected={modo === m}
            onPress={() => onEscolher(m)}
          />
        ))}
      </View>
    </Card>
  );
};

// ============================================================
// Grupo muscular — só os MEUS grupos
// ============================================================

/**
 * A lista é dos grupos de quem está olhando. Ninguém vê os do parceiro: a RLS
 * não entrega o plano alheio, e inventar uma interseção seria mostrar dado que
 * o servidor não deu.
 */
export const JointMuscleGroupPicker = ({
  grupos,
  escolhido,
  podeEscolher,
  onEscolher,
}: {
  grupos: string[];
  escolhido: string | null;
  podeEscolher: boolean;
  onEscolher: (g: string) => void;
}) => {
  if (!podeEscolher) {
    return (
      <Card testID="grupo-leitura">
        <SectionHeader title="Grupo muscular" />
        <ListRow title={escolhido ?? 'Quem convidou está escolhendo'} />
      </Card>
    );
  }
  if (grupos.length === 0) {
    return (
      <Card testID="grupo-vazio">
        <SectionHeader title="Grupo muscular" />
        <EmptyState
          title="Você não tem treinos disponíveis"
          description="Seu plano ativo não tem sessões que possam entrar em um treino conjunto."
        />
      </Card>
    );
  }
  return (
    <Card testID="grupo-escolha">
      <SectionHeader title="Grupo muscular" />
      <View style={layout.coluna}>
        {grupos.map((g) => (
          <OptionButton
            key={g}
            testID={`grupo-${g}`}
            label={g}
            selected={escolhido === g}
            onPress={() => onEscolher(g)}
          />
        ))}
      </View>
    </Card>
  );
};

// ============================================================
// Sessão própria
// ============================================================

export const JointSessionPicker = ({
  sessoes,
  escolhida,
  onEscolher,
  titulo = 'Seu treino',
}: {
  sessoes: SessaoElegivel[];
  escolhida: string | null;
  onEscolher: (id: string) => void;
  titulo?: string;
}) => (
  <Card testID="sessao-escolha">
    <SectionHeader title={titulo} />
    {sessoes.length === 0 ? (
      <EmptyState
        title="Nenhum treino elegível"
        description="Não há sessão do seu plano ativo que sirva para este grupo."
      />
    ) : (
      <View style={layout.coluna}>
        {sessoes.map((s) => (
          <OptionButton
            key={s.id}
            testID={`sessao-${s.id}`}
            label={`${s.title} — ${s.muscleGroups.join(' · ')}`}
            selected={escolhida === s.id}
            onPress={() => onEscolher(s.id)}
          />
        ))}
      </View>
    )}
  </Card>
);

// ============================================================
// Incompatibilidade — a saída depende do papel
// ============================================================

/**
 * Diz o grupo pedido e OS MEUS grupos. Nunca os do parceiro, que ninguém vê.
 * E oferece ação só a quem pode agir: o convidado pede, o anfitrião troca.
 */
export const JointIncompatibilidade = ({
  incompatibilidade,
  onTrocarGrupo,
  onTrocarModo,
}: {
  incompatibilidade: Incompatibilidade;
  onTrocarGrupo?: () => void;
  onTrocarModo?: () => void;
}) => {
  const { grupoPedido, meusGrupos, possoTrocar } = incompatibilidade;
  const meus = meusGrupos.length > 0 ? meusGrupos.join(', ') : 'nenhum grupo disponível';
  return (
    <Card testID="incompatibilidade">
      <Notice
        tone="warning"
        title={`Você não tem treino de ${grupoPedido}`}
        description={
          possoTrocar
            ? `Seus grupos disponíveis: ${meus}. Escolha outro grupo ou mude o modo.`
            : `Seus grupos disponíveis: ${meus}. Peça para quem convidou trocar o grupo ou o modo.`
        }
      />
      {possoTrocar ? (
        <View style={layout.coluna}>
          <Button
            label="Trocar o grupo"
            onPress={onTrocarGrupo}
          />
          <Button
            label="Trocar o modo"
            variant="outline"
            onPress={onTrocarModo}
          />
        </View>
      ) : null}
    </Card>
  );
};

// ============================================================
// Prontidão
// ============================================================

export const JointReadyBar = ({
  euPronto,
  parceiroPronto,
  habilitado,
  motivo,
  emCurso,
  onAlternar,
}: {
  euPronto: boolean;
  parceiroPronto: boolean;
  habilitado: boolean;
  motivo: string;
  emCurso: boolean;
  onAlternar: (pronto: boolean) => void;
}) => (
  <Card testID="prontidao">
    <View style={layout.linha}>
      <Chip label={euPronto ? 'Você: pronto' : 'Você: aguardando'} tone={euPronto ? 'accent' : 'neutral'} />
      <Chip
        label={parceiroPronto ? 'Parceiro: pronto' : 'Parceiro: aguardando'}
        tone={parceiroPronto ? 'accent' : 'neutral'}
      />
    </View>
    <Button
      label={euPronto ? 'Não estou pronto' : 'Estou pronto'}
      disabled={!habilitado || emCurso}
      loading={emCurso}
      onPress={() => onAlternar(!euPronto)}
    />
    {!habilitado ? <Notice tone="info" title={motivo} /> : null}
  </Card>
);
