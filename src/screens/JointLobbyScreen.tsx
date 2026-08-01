// src/screens/JointLobbyScreen.tsx
// Treino Conjunto 2.0 — Sprint 02. Onde a dupla se acerta antes de começar.
//
// TRÊS COISAS QUE ESTA TELA NÃO FAZ, e o motivo:
//
//  1. Não guarda estado próprio da dupla. Tudo vem do snapshot autoritativo —
//     duas telas que discordam é o modo de falha caro desta feature.
//  2. Não cancela o treino por saída técnica. Voltar, trocar de aba ou perder o
//     canal NÃO chamam `abandon`. Encerrar é decisão confirmada do usuário, e a
//     confirmação diz que encerra para os dois.
//  3. Não navega para o player. Em `active` ela mostra o handoff; o player é o
//     Sprint 03.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Alert, BackHandler, StyleSheet, View } from 'react-native';
import theme from '../theme/theme';
import { Button } from '../components/ui';
import { Card, Screen, ScreenTitle, SectionHeader } from '../components/ui/Surface';
import { EmptyState, Notice } from '../components/ui/Feedback';
import { StackHeader } from '../components/ui/Controls';
import {
  JointIncompatibilidade,
  JointModePicker,
  JointMuscleGroupPicker,
  JointPartnerRow,
  JointReadyBar,
  JointSessionPicker,
} from '../components/joint';
import {
  ACAO_DA_SITUACAO,
  MENSAGEM_DA_SITUACAO,
  ROTULO_PENDENCIA,
  incompatibilidadeDe,
  meusGrupos,
  pendenciaAtual,
  permissoesDe,
  sessoesElegiveis,
  situacaoDoLobby,
  type SessaoElegivel,
} from '../engine/jointLobbyModel';
import { parceiroDe, participanteDe, type JointMode } from '../engine/jointSessionModel';
import { useJointSession } from '../hooks/useJointSession';

const layout = StyleSheet.create({
  coluna: { gap: theme.spacing.sm },
});

export type JointLobbyScreenProps = {
  navigation: { goBack: () => void; navigate: (rota: string, params?: any) => void };
  route: { params: { jointSessionId: string } };
  meuUserId: string;
  /** As sessões elegíveis DESTE usuário. Nunca as do parceiro. */
  minhasSessoes: SessaoElegivel[];
  confirmar?: (titulo: string, mensagem: string, onSim: () => void) => void;
  anunciar?: (texto: string) => void;
};

const confirmarPadrao = (titulo: string, mensagem: string, onSim: () => void) =>
  Alert.alert(titulo, mensagem, [
    { text: 'Ficar no treino', style: 'cancel' },
    { text: 'Encerrar', style: 'destructive', onPress: onSim },
  ]);

const JointLobbyScreen = ({
  navigation,
  route,
  meuUserId,
  minhasSessoes,
  confirmar = confirmarPadrao,
  anunciar = (t) => AccessibilityInfo.announceForAccessibility?.(t),
}: JointLobbyScreenProps) => {
  const { jointSessionId } = route.params;
  const j = useJointSession(jointSessionId, meuUserId);
  const [grupoEscolhido, setGrupoEscolhido] = useState<string | null>(null);

  const situacao = situacaoDoLobby({
    carregando: j.carregando,
    state: j.state,
    erroMotivo: j.erro?.motivo ?? null,
    erroKind: j.erro?.kind ?? null,
  });

  // Erro é ANUNCIADO, não só desenhado: quem usa leitor de tela precisa saber
  // que a ação falhou sem varrer a tela atrás de um texto novo.
  useEffect(() => {
    if (j.erro) anunciar(j.erro.mensagem);
  }, [j.erro, anunciar]);

  const sair = useCallback(() => {
    confirmar(
      'Encerrar o treino conjunto?',
      'Sair encerra o treino para você e para o seu parceiro.',
      () => {
        void j.sair().then((ok) => {
          // Só sai depois do sucesso. Se a RPC falhar, permanece no lobby com o
          // erro anunciado — sair de qualquer jeito deixaria a dupla num estado
          // que ninguém consegue ver.
          if (ok) navigation.goBack();
        });
      },
    );
  }, [confirmar, j, navigation]);

  // Back de hardware passa pela MESMA confirmação.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      sair();
      return true;
    });
    return () => sub.remove();
  }, [sair]);

  const state = j.state;
  const permissoes = permissoesDe(state, meuUserId);
  const pendencia = pendenciaAtual(state, meuUserId);
  const eu = state ? participanteDe(state, meuUserId) : null;
  const parceiro = state ? parceiroDe(state, meuUserId) : null;
  const grupoDaSessao = state?.muscleGroup ?? grupoEscolhido;

  const elegiveis = useMemo(
    () => sessoesElegiveis(minhasSessoes, grupoDaSessao ?? null, jointSessionId),
    [minhasSessoes, grupoDaSessao, jointSessionId],
  );
  const incompatibilidade = useMemo(
    () => incompatibilidadeDe(state, meuUserId, minhasSessoes),
    [state, meuUserId, minhasSessoes],
  );

  if (situacao !== 'lobby' && situacao !== 'iniciado') {
    const acao = ACAO_DA_SITUACAO[situacao];
    return (
      <Screen>
        <StackHeader title="Treinar junto" onBack={() => navigation.goBack()} />
        <Card testID={`situacao-${situacao}`}>
          <EmptyState
            title={MENSAGEM_DA_SITUACAO[situacao]}
            action={
              acao === 'nenhuma' ? undefined : (
                <Button
                  label={
                    acao === 'tentar_de_novo' ? 'Tentar de novo'
                      : acao === 'ver_historico' ? 'Ver histórico'
                      : acao === 'criar_ou_entrar' ? 'Criar ou entrar'
                      : 'Voltar'
                  }
                  variant="outline"
                  testID={`acao-${acao}`}
                  onPress={() => {
                    if (acao === 'tentar_de_novo') void j.recarregar();
                    else navigation.goBack();
                  }}
                />
              )
            }
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title="Treinar junto" onBack={sair} />
      <ScreenTitle title={situacao === 'iniciado' ? 'Treino iniciado' : 'Lobby'} />

      <JointPartnerRow
        nome={j.parceiro?.displayName ?? null}
        conexao={j.conexao}
        presenca={j.presenca}
      />

      {situacao === 'iniciado' ? (
        // Handoff declarado: o player é o Sprint 03. Navegar para algo que não
        // existe seria pior do que parar aqui e dizer o que aconteceu.
        <Card testID="handoff-active">
          <Notice
            tone="info"
            title="Treino iniciado"
            description="A execução revezada chega na próxima etapa do app."
          />
        </Card>
      ) : (
        <View style={layout.coluna}>
          <Card testID="pendencia">
            <SectionHeader title="O que falta" />
            <Notice tone="info" title={ROTULO_PENDENCIA[pendencia]} />
            {!state?.guestUserId && j.convite ? (
              <Notice
                tone="info"
                title={`Código: ${j.convite.inviteCode}`}
                description="Compartilhe com quem vai treinar com você."
                testID="codigo-lobby"
              />
            ) : null}
          </Card>

          <JointModePicker
            modo={state?.mode ?? null}
            podeEscolher={permissoes.podeEscolherModo}
            onEscolher={(m: JointMode) => void j.escolherModo(m, m === 'each_own' ? grupoEscolhido : null)}
          />

          {state?.mode === 'each_own' ? (
            <JointMuscleGroupPicker
              grupos={meusGrupos(minhasSessoes)}
              escolhido={state.muscleGroup}
              podeEscolher={permissoes.podeEscolherGrupo}
              onEscolher={(g) => {
                setGrupoEscolhido(g);
                void j.escolherModo('each_own', g);
              }}
            />
          ) : null}

          {incompatibilidade ? (
            <JointIncompatibilidade
              incompatibilidade={incompatibilidade}
              onTrocarGrupo={() => setGrupoEscolhido(null)}
              onTrocarModo={() => void j.escolherModo('host_plan')}
            />
          ) : null}

          {permissoes.podeMaterializarCopia && !eu?.plannedSessionId ? (
            <Card testID="materializar">
              <SectionHeader title="Treino recebido" />
              <Notice
                tone="info"
                title={`Estrutura de ${j.parceiro?.displayName ?? 'quem convidou'}`}
                description="Você informa suas próprias cargas e repetições."
              />
              <Button
                label="Usar esta estrutura"
                loading={j.emCurso === 'materializar'}
                disabled={j.emCurso != null}
                testID="usar-estrutura"
                onPress={() => {
                  void j.materializarCopia().then((id) => {
                    if (id) void j.confirmarSessao(id);
                  });
                }}
              />
            </Card>
          ) : null}

          {permissoes.podeConfirmarSessaoPropria && !incompatibilidade ? (
            <JointSessionPicker
              sessoes={elegiveis}
              escolhida={eu?.plannedSessionId ?? null}
              onEscolher={(id) => void j.confirmarSessao(id)}
            />
          ) : null}

          <JointReadyBar
            euPronto={Boolean(eu?.ready)}
            parceiroPronto={Boolean(parceiro?.ready)}
            habilitado={permissoes.podeFicarPronto && j.emCurso == null}
            motivo={ROTULO_PENDENCIA[pendencia]}
            emCurso={j.emCurso === 'pronto'}
            onAlternar={(pronto) => void j.definirPronto(pronto)}
          />

          {j.erro ? <Notice tone="danger" title={j.erro.mensagem} testID="erro-lobby" /> : null}
        </View>
      )}
    </Screen>
  );
};

export default JointLobbyScreen;
