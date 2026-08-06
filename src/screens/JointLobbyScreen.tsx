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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, BackHandler, StyleSheet, View } from 'react-native';
import theme from '../theme/theme';
import { Button } from '../components/ui';
import { Card, Screen, ScreenTitle, SectionHeader } from '../components/ui/Surface';
import { EmptyState, Notice } from '../components/ui/Feedback';
import { StackHeader } from '../components/ui/Controls';
import { Share } from 'react-native';
import { buildInviteLink } from '../navigation/inviteLink';
import {
  JointIncompatibilidade,
  JointInviteCard,
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
  type SituacaoDoLobby,
} from '../engine/jointLobbyModel';
import { parceiroDe, participanteDe, type JointMode } from '../engine/jointSessionModel';
import { useJointSession } from '../hooks/useJointSession';
import { useAuth } from '../contexts/AuthContext';
import { getPlanSessions } from '../services/trainingRepository';

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
  /** Falha ao carregar o próprio plano — a lista de sessões fica vazia. */
  erroPlano?: string | null;
  onRecarregarPlano?: () => void;
  /** Relógio injetável: a expiração do convite é testada sem esperar. */
  agora?: () => number;
};

/**
 * O que conta como "o usuário pediu para sair".
 *
 * `GO_BACK` e `POP` vêm do header, do back de hardware e do gesto. `RESET`,
 * `REPLACE` e `NAVIGATE` vêm de logout, deep link e troca de árvore — remoções
 * técnicas, que não podem encerrar a dupla.
 */
const SAIDAS_EXPLICITAS = new Set(['GO_BACK', 'POP', 'POP_TO_TOP']);
export const ehSaidaExplicita = (tipo: unknown): boolean =>
  typeof tipo === 'string' && SAIDAS_EXPLICITAS.has(tipo);

const confirmarPadrao = (titulo: string, mensagem: string, onSim: () => void) =>
  Alert.alert(titulo, mensagem, [
    { text: 'Ficar no treino', style: 'cancel' },
    { text: 'Encerrar', style: 'destructive', onPress: onSim },
  ]);

export const JointLobbyView = ({
  navigation,
  route,
  meuUserId,
  minhasSessoes,
  confirmar = confirmarPadrao,
  anunciar = (t) => AccessibilityInfo.announceForAccessibility?.(t),
  erroPlano = null,
  onRecarregarPlano,
  agora = () => Date.now(),
}: JointLobbyScreenProps) => {
  const { jointSessionId } = route.params;
  const j = useJointSession(jointSessionId, meuUserId);
  const [grupoEscolhido, setGrupoEscolhido] = useState<string | null>(null);
  // Modo escolhido na tela mas ainda NÃO enviado: `each_own` espera o grupo.
  const [modoPreparado, setModoPreparado] = useState<JointMode | null>(null);
  // Trava de saída: uma vez autorizada, o `beforeRemove` deixa passar.
  const saindoRef = useRef(false);
  // O anfitrião pediu para trocar o grupo: o seletor reabre com nada marcado.
  const [trocandoGrupo, setTrocandoGrupo] = useState(false);

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

  // ------------------------------------------------------------------
  // UMA máquina de saída — F11
  // ------------------------------------------------------------------
  //
  // Antes havia dois caminhos: o header chamava `sair()` + `goBack()` sem armar
  // a liberação, e o `beforeRemove` interceptava e pedia confirmação e R13 DE
  // NOVO. Header, back de hardware e gesto passam agora pela mesma função, e a
  // liberação é armada ANTES de despachar a ação original.
  //
  // E encerrar a dupla só faz sentido enquanto ela existe: em terminal ou
  // `not_found` a saída é livre — pedir confirmação ali prenderia o usuário
  // numa tela morta, e o R13 falharia de qualquer jeito.
  const situacaoRef = useRef<SituacaoDoLobby>('carregando');

  const encerrar = useCallback(
    (despachar: () => void) => {
      const atual = situacaoRef.current;
      const dupleViva = atual === 'lobby' || atual === 'iniciado';
      if (!dupleViva) {
        saindoRef.current = true;
        despachar();
        return;
      }
      confirmar(
        'Encerrar o treino conjunto?',
        'Sair encerra o treino para você e para o seu parceiro.',
        () => {
          void j.sair().then((ok) => {
            // Só sai depois do sucesso. Falhou, permanece no lobby com o erro
            // anunciado — sair assim mesmo deixaria a dupla num estado que
            // ninguém consegue ver.
            if (!ok) return;
            saindoRef.current = true;
            despachar();
          });
        },
      );
    },
    [confirmar, j],
  );

  const sair = useCallback(() => {
    encerrar(() => navigation.goBack());
  }, [encerrar, navigation]);

  // Back de hardware: mesma máquina.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      sair();
      return true;
    });
    return () => sub.remove();
  }, [sair]);

  // Gesto e pop nativos não passam pelo header nem pelo BackHandler. Quando a
  // saída já foi autorizada (`saindoRef`), este ouvinte deixa passar — é o que
  // evita a segunda confirmação.
  useEffect(() => {
    const remover = (navigation as any).addListener?.('beforeRemove', (e: any) => {
      if (saindoRef.current) return;
      // F20: NEM TODA REMOÇÃO É DECISÃO DO USUÁRIO. `RESET`, `REPLACE` e
      // navegações de logout ou troca técnica de rota removem a tela sem que
      // ninguém tenha pedido para encerrar o treino — confirmar e chamar R13
      // ali cancelaria a dupla pelas costas dos dois. Só saída explícita
      // (voltar/pop/gesto) atravessa a máquina de saída.
      if (!ehSaidaExplicita(e?.data?.action?.type)) return;
      e.preventDefault?.();
      encerrar(() => (navigation as any).dispatch?.(e.data.action));
    });
    return () => remover?.();
  }, [encerrar, navigation]);

  const state = j.state;
  const permissoes = permissoesDe(state, meuUserId);
  const pendencia = pendenciaAtual(state, meuUserId);
  const eu = state ? participanteDe(state, meuUserId) : null;
  const parceiro = state ? parceiroDe(state, meuUserId) : null;
  const grupoDaSessao = state?.muscleGroup ?? grupoEscolhido;

  // F14: quem RECEBE a estrutura não tem picker nem pode materializar antes de
  // o dono confirmar a fonte. Dizer "Escolha o seu treino" ali manda o usuário
  // procurar um controle que não existe.
  const esperandoFonte =
    permissoes.podeMaterializarCopia && !parceiro?.plannedSessionId;
  const rotuloDaPendencia = esperandoFonte
    ? `Aguarde ${j.parceiro?.displayName ?? 'quem convidou'} escolher o treino`
    : ROTULO_PENDENCIA[pendencia];

  const elegiveis = useMemo(
    () => sessoesElegiveis(minhasSessoes, grupoDaSessao ?? null, jointSessionId),
    [minhasSessoes, grupoDaSessao, jointSessionId],
  );
  const incompatibilidade = useMemo(
    () => incompatibilidadeDe(state, meuUserId, minhasSessoes),
    [state, meuUserId, minhasSessoes],
  );

  situacaoRef.current = situacao;

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
                    // O CTA precisa levar ao histórico de verdade; `goBack`
                    // devolvia o usuário para a mesma tela de onde ele veio.
                    // F12: `SessionHistory` vive no ProgressStack, e o lobby
                    // está no HomeStack — `navigate('SessionHistory')` daqui é
                    // ação NÃO TRATADA. A navegação precisa ser aninhada.
                    else if (acao === 'ver_historico') {
                      navigation.navigate('Progress', { screen: 'SessionHistory' });
                    }
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
            <Notice tone="info" title={rotuloDaPendencia} />
          </Card>

          {/* F3: o lobby frio precisa do convite INTEIRO — código, link, relógio,
              compartilhar e rotacionar. Mostrar só o código deixava o anfitrião
              sem como enviar nada depois de reabrir o app. */}
          {/* Só o ANFITRIÃO vê o convite: o hook já o busca só para ele, mas a
              condição diz isso na tela em vez de depender de o hook ter
              recusado a leitura. */}
          {state?.hostUserId === meuUserId && !state?.guestUserId && j.convite ? (
            <JointInviteCard
              inviteCode={j.convite.inviteCode}
              inviteExpiresAt={j.convite.inviteExpiresAt}
              agoraMs={agora()}
              emCurso={j.emCurso != null}
              onCompartilhar={() => {
                void Share.share({
                  message: `Treine comigo no Força: ${buildInviteLink(j.convite!.inviteCode)}`,
                }).catch(() => anunciar('Não foi possível abrir o compartilhamento.'));
              }}
              onRotacionar={() => { void j.rotacionarConvite(); }}
            />
          ) : null}

          <JointModePicker
            modo={state?.mode ?? null}
            podeEscolher={permissoes.podeEscolherModo}
            onEscolher={(m: JointMode) => {
              // `each_own` SEM grupo é recusado pela RPC com 22023. Escolher o
              // modo aqui só arma a etapa do grupo; a chamada sai quando os dois
              // valores existem — modo e grupo viajam JUNTOS.
              if (m === 'each_own') {
                setModoPreparado('each_own');
                return;
              }
              setModoPreparado(null);
              void j.escolherModo(m, null);
            }}
          />

          {(state?.mode === 'each_own' || modoPreparado === 'each_own') ? (
            <JointMuscleGroupPicker
              grupos={meusGrupos(minhasSessoes)}
              escolhido={trocandoGrupo ? grupoEscolhido : (state?.muscleGroup ?? grupoEscolhido)}
              podeEscolher={permissoes.podeEscolherModo}
              onEscolher={(g) => {
                setGrupoEscolhido(g);
                setTrocandoGrupo(false);
                void j.escolherModo('each_own', g);
              }}
            />
          ) : null}

          {incompatibilidade ? (
            <JointIncompatibilidade
              incompatibilidade={incompatibilidade}
              // F13: zerar `grupoEscolhido` não mudava nada — `state.muscleGroup`
              // continuava dominante e nenhuma RPC saía. Trocar de grupo reabre
              // o seletor, e é a NOVA escolha que chama R3 com each_own+grupo.
              onTrocarGrupo={() => {
                setGrupoEscolhido(null);
                setTrocandoGrupo(true);
              }}
              onTrocarModo={() => { setTrocandoGrupo(false); void j.escolherModo('host_plan', null); }}
            />
          ) : null}

          {/* F5: sem a fonte confirmada pelo dono, `materialize` responde P0001.
              Oferecer o botão antes disso é desenhar um caminho que só falha. */}
          {permissoes.podeMaterializarCopia
            && !eu?.plannedSessionId
            && Boolean(parceiro?.plannedSessionId) ? (
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

          {/* F19: falha ao carregar o PRÓPRIO plano não é "nenhum treino
              elegível" — sem esta distinção, uma queda de rede vira a mensagem
              de quem realmente não tem treino, e o usuário não tenta de novo. */}
          {erroPlano ? (
            <Card testID="erro-plano">
              <Notice tone="danger" title="Não foi possível carregar seus treinos"
                description={erroPlano} />
              <Button label="Tentar de novo" variant="outline"
                testID="recarregar-plano" onPress={() => onRecarregarPlano?.()} />
            </Card>
          ) : null}

          {permissoes.podeConfirmarSessaoPropria && !incompatibilidade && !erroPlano ? (
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
            motivo={rotuloDaPendencia}
            emCurso={j.emCurso === 'pronto'}
            onAlternar={(pronto) => void j.definirPronto(pronto)}
          />

          {j.erro ? <Notice tone="danger" title={j.erro.mensagem} testID="erro-lobby" /> : null}
        </View>
      )}
    </Screen>
  );
};

// ============================================================
// Container — é ELE que o React Navigation monta
// ============================================================
//
// A rodada 1 registrou a view diretamente com `as any`, e ela exigia
// `meuUserId` e `minhasSessoes` que o navegador NUNCA fornece: no app,
// `sessoesElegiveis(undefined, ...)` quebrava. Todos os testes injetavam as
// props e escondiam isso. O container existe para que a tela real busque as
// próprias dependências, e para que a view continue testável por injeção.

const JointLobbyScreen = (props: {
  navigation: JointLobbyScreenProps['navigation'];
  route: JointLobbyScreenProps['route'];
}) => {
  const { user } = useAuth();
  const [minhasSessoes, setMinhasSessoes] = useState<SessaoElegivel[]>([]);
  const [carregandoPlano, setCarregandoPlano] = useState(true);
  const [erroPlano, setErroPlano] = useState<string | null>(null);

  const userId = user?.id ?? null;

  // Cada carga tem uma geração; resposta de geração antiga é descartada — dois
  // disparos concorrentes (montagem + "Tentar de novo", ou toques repetidos)
  // não podem deixar a resposta MAIS VELHA sobrescrever a MAIS NOVA (achado N5).
  const geracaoRef = useRef(0);

  const carregarPlano = useCallback(async () => {
    if (!userId) return;
    const geracao = ++geracaoRef.current;
    setCarregandoPlano(true);
    setErroPlano(null);
    try {
      const sessoes = await getPlanSessions(userId);
      if (geracao !== geracaoRef.current) return;
      // Só o MEU plano ativo, mapeado para o que o modelo entende. A lista do
      // parceiro não é pedida nem recebida — a RLS não a entregaria.
      setMinhasSessoes(
        sessoes.map((s: any) => ({
          id: String(s.id),
          title: String(s.title ?? 'Treino'),
          muscleGroups: Array.isArray(s.muscle_groups) ? s.muscle_groups.map(String) : [],
          status: String(s.status ?? 'pending'),
          jointSessionId: s.joint_session_id ?? null,
        })),
      );
    } catch (e) {
      if (geracao !== geracaoRef.current) return;
      setErroPlano(e instanceof Error ? e.message : 'Não foi possível carregar seus treinos.');
    } finally {
      if (geracao === geracaoRef.current) setCarregandoPlano(false);
    }
  }, [userId]);

  useEffect(() => { void carregarPlano(); }, [carregarPlano]);

  if (!userId) {
    return (
      <Screen>
        <StackHeader title="Treinar junto" onBack={() => props.navigation.goBack()} />
        <Card testID="sem-sessao">
          <EmptyState title="Entre na sua conta para treinar junto" />
        </Card>
      </Screen>
    );
  }

  if (carregandoPlano) {
    return (
      <Screen>
        <StackHeader title="Treinar junto" onBack={() => props.navigation.goBack()} />
        <Card testID="carregando-plano">
          <EmptyState title="Carregando seus treinos…" />
        </Card>
      </Screen>
    );
  }

  return (
    <JointLobbyView
      navigation={props.navigation}
      route={props.route}
      meuUserId={userId}
      minhasSessoes={minhasSessoes}
      erroPlano={erroPlano}
      onRecarregarPlano={carregarPlano}
    />
  );
};

export default JointLobbyScreen;
