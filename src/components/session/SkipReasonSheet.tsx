// src/components/session/SkipReasonSheet.tsx
// Sheet do "não vou fazer": o aluno declara a recusa e diz POR QUÊ.
//
// O motivo é obrigatório e vem de lista fechada (migration 0020) porque este
// dado precisa AGREGAR — "recusou este exercício 3×" é o que permite propor uma
// troca depois. Texto livre não agrega, então a nota é opcional e só complementa.
//
// Mesmo molde do ReorderScopeSheet: Modal nativo do RN, sem dependência nativa,
// testável em jest.

import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import theme from '../../theme/theme';
import { Button, TextField } from '../ui';
import { SKIP_REASONS, SKIP_REASON_LABELS, type SkipReason } from '../../engine/sessionModel';

type Props = {
  visible: boolean;
  /** O que está sendo recusado — muda o texto, não o contrato. */
  escopo: 'exercicio' | 'sessao';
  /** Nome do exercício ou título do treino, para a recusa ser inequívoca. */
  alvo: string;
  onConfirm: (reason: SkipReason, note: string | null) => void;
  onDismiss: () => void;
  /** Gravação em curso: trava o botão e o toque duplo. */
  busy?: boolean;
  /** Renderiza o conteúdo dentro de um Modal pai, sem criar outro Dialog nativo. */
  inline?: boolean;
  /**
   * O exercício-alvo é medido por tempo (cardio/isometria) — só relevante
   * quando `escopo === 'exercicio'`. REQ-06, segundo entry point (Fase 3):
   * habilita a oferta de "Trocar modalidade" quando o motivo selecionado é
   * `sem_equipamento`.
   */
  ehCardio?: boolean;
  /**
   * Aciona o caminho de troca de modalidade em vez da recusa. NUNCA invoca
   * `onConfirm`/`skip_session_exercise` — caminho aditivo que reusa o mesmo
   * SwapModalitySheet do Plano 03-03, nunca substitui o fluxo de recusa.
   */
  onSolicitarTroca?: () => void;
};

const NOTA_MAX = 280;

const SkipReasonSheet = ({
  visible,
  escopo,
  alvo,
  onConfirm,
  onDismiss,
  busy = false,
  inline = false,
  ehCardio,
  onSolicitarTroca,
}: Props) => {
  const [reason, setReason] = useState<SkipReason | null>(null);
  const [note, setNote] = useState('');

  // Reabrir o sheet nunca herda a escolha anterior: confirmar por engano o
  // motivo de outro exercício grava um dado errado que ninguém revisa depois.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote('');
    }
  }, [visible]);

  const ehSessao = escopo === 'sessao';
  // REQ-06, segundo entry point: só oferece a troca quando o motivo é
  // sem_equipamento NUM exercício de cardio de escopo exercício — a recusa
  // de sessão inteira nunca tem um único exercício de cardio para trocar.
  const ofereceTroca =
    escopo === 'exercicio' &&
    reason === 'sem_equipamento' &&
    ehCardio === true &&
    onSolicitarTroca != null;

  const content = (
      <Pressable
        style={styles.backdrop}
        onPress={busy ? undefined : onDismiss}
        testID="skip-reason-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Fechar sem recusar"
      >
        <Pressable
          style={styles.card}
          onPress={() => undefined}
          accessibilityViewIsModal
          accessibilityLabel={ehSessao ? 'Recusar o treino de hoje' : 'Recusar exercício'}
        >
          <View style={styles.handle} />
          <Text style={styles.kicker}>{ehSessao ? 'Treino de hoje' : 'Exercício'}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {ehSessao ? 'Não vou treinar hoje' : `Não vou fazer ${alvo}`}
          </Text>
          <Text style={styles.description}>
            {ehSessao
              ? 'O treino fica registrado como recusado, com o seu motivo. A semana fecha com menos volume — nada é remanejado para os outros dias.'
              : 'As séries que você já registrou continuam valendo. As que faltam saem do treino de hoje — o exercício segue nas próximas semanas.'}
          </Text>

          <ScrollView style={styles.lista} keyboardShouldPersistTaps="handled">
            {SKIP_REASONS.map((r) => {
              const selecionado = reason === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.option, selecionado && styles.optionSelected]}
                  onPress={() => setReason(r)}
                  disabled={busy}
                  testID={`skip-reason-${r}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selecionado, disabled: busy }}
                  accessibilityLabel={SKIP_REASON_LABELS[r]}
                >
                  <Text
                    style={[styles.optionLabel, selecionado && styles.optionLabelSelected]}
                  >
                    {SKIP_REASON_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TextField
              label="Quer detalhar? (opcional)"
              value={note}
              onChangeText={(t) => setNote(t.slice(0, NOTA_MAX))}
              placeholder="Ex.: ombro incomodou no aquecimento"
              multiline
              editable={!busy}
              maxLength={NOTA_MAX}
              containerStyle={styles.nota}
              testID="skip-reason-note"
            />
          </ScrollView>

          {ofereceTroca ? (
            <Button
              label="Trocar modalidade"
              variant="outline"
              onPress={() => onSolicitarTroca!()}
              disabled={busy}
              testID="skip-reason-oferecer-troca"
            />
          ) : null}
          <Button
            label={ofereceTroca ? 'Recusar mesmo assim' : ehSessao ? 'Recusar o treino' : 'Não vou fazer'}
            onPress={() => {
              // Guarda de toque duplo e de motivo ausente: o servidor recusaria
              // com 22023, mas a tela não deve nem chegar lá. Este botão NUNCA
              // é substituído pela troca — "Trocar modalidade" acima é um
              // caminho aditivo que nunca invoca onConfirm/skip_session_exercise.
              if (busy || reason == null) return;
              onConfirm(reason, note.trim() ? note.trim() : null);
            }}
            disabled={busy || reason == null}
            testID="skip-reason-confirm"
          />
          <TouchableOpacity
            style={styles.cancelar}
            onPress={busy ? undefined : onDismiss}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Voltar sem recusar"
          >
            <Text style={styles.cancelarLabel}>Voltar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
  );
  if (inline) return content;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>{content}</Modal>;
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
  },
  card: {
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
    borderTopLeftRadius: theme.borderRadius.xxl,
    borderTopRightRadius: theme.borderRadius.xxl,
    backgroundColor: theme.colors.surface.card,
    ...theme.elevation.floating,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginBottom: theme.spacing.lg,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.border.strong,
  },
  kicker: {
    marginBottom: 2,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  description: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
  },
  // Altura máxima em vez de flex: o sheet cresce com o conteúdo, mas a lista de
  // motivos + nota não empurra o botão de confirmar fora da tela no telefone.
  lista: { maxHeight: 320, marginBottom: theme.spacing.md },
  option: {
    minHeight: theme.hitTarget.regular,
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.elevated,
  },
  optionSelected: {
    borderColor: theme.colors.border.strong,
    backgroundColor: theme.colors.surface.card,
  },
  optionLabel: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
  },
  optionLabelSelected: {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  nota: { marginTop: theme.spacing.lg },
  cancelar: {
    minHeight: theme.hitTarget.regular,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
  },
  cancelarLabel: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
});

export default SkipReasonSheet;
