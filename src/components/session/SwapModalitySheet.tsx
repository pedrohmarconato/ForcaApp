// src/components/session/SwapModalitySheet.tsx
// Sheet de escolha de modalidade — entry point 1 (fila) e entry point 2
// (ramo `sem_equipamento` do SkipReasonSheet) da troca de cardio (Fase 3,
// REQ-06). Molde exato de SkipReasonSheet.tsx: Modal nativo/prop `inline`,
// backdrop, card com handle, lista fechada radio-select.
//
// Diferença deliberada: SEM campo de nota opcional. A assinatura de
// activeSessionStore.swapExercise (Plano 03-02) é (exerciseId, toModality),
// sem nota — swapSessionExercise/a RPC sempre recebem `note: null` a partir
// do store. Coletar uma nota aqui criaria um campo que pareceria funcionar
// mas seria descartado em silêncio.
//
// Corpo condicional replica CardioPrescritoSection.tsx:60-81 — mesma ordem
// de prioridade: erro > carregando (modalidades === null) > vazio
// (modalidades.length === 0) > lista fechada. A lista SÓ mostra as
// modalidades aceitas do usuário (D-02) — nunca o catálogo inteiro.
//
// O estado vazio é medido sobre `opcoes` (já filtrado pelo exercício atual),
// não sobre `modalidades`: quem só aceita a modalidade que está tentando
// trocar tem `modalidades.length === 1` mas `opcoes.length === 0` — sem o
// filtro, a tela mostraria uma área em branco com o botão morto (CR-02). Os
// dois vazios têm textos distintos porque são situações diferentes:
// nenhuma modalidade cadastrada × nenhuma OUTRA modalidade disponível.

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
import { Button } from '../ui';
import { EmptyState, Notice, Skeleton } from '../ui/Feedback';
import { type CardioModalidade } from '../../constants/cardioModalidades';

type Props = {
  visible: boolean;
  /** Nome do exercício/modalidade sendo trocado, para o título ser inequívoco. */
  exercicioAtualNome: string;
  /** null = carregando; [] = confirmado vazio (D-02). */
  modalidades: readonly CardioModalidade[] | null;
  erro?: boolean;
  onRecarregar?: () => void;
  onConfirm: (toModality: CardioModalidade) => void;
  onDismiss: () => void;
  /** Gravação em curso: trava o botão e o toque duplo. */
  busy?: boolean;
  /** Renderiza o conteúdo dentro de um Modal pai, sem criar outro Dialog nativo. */
  inline?: boolean;
};

const SwapModalitySheet = ({
  visible,
  exercicioAtualNome,
  modalidades,
  erro = false,
  onRecarregar,
  onConfirm,
  onDismiss,
  busy = false,
  inline = false,
}: Props) => {
  const [toModality, setToModality] = useState<CardioModalidade | null>(null);

  // Reabrir o sheet nunca herda a escolha anterior — mesmo raciocínio de
  // SkipReasonSheet: confirmar por engano a modalidade de outra sessão
  // grava um dado errado que ninguém revisa depois.
  useEffect(() => {
    if (visible) {
      setToModality(null);
    }
  }, [visible]);

  const opcoes = (modalidades ?? []).filter((m) => m !== exercicioAtualNome);

  const content = (
    <Pressable
      style={styles.backdrop}
      onPress={busy ? undefined : onDismiss}
      testID="swap-modality-backdrop"
      accessibilityRole="button"
      accessibilityLabel="Fechar sem trocar"
    >
      <Pressable
        style={styles.card}
        onPress={() => undefined}
        accessibilityViewIsModal
        accessibilityLabel={`Trocar ${exercicioAtualNome}`}
      >
        <View style={styles.handle} />
        <Text style={styles.kicker}>Cardio</Text>
        <Text style={styles.title} accessibilityRole="header">
          {`Trocar ${exercicioAtualNome}`}
        </Text>
        <Text style={styles.description}>
          O tempo alvo desta sessão é mantido na nova modalidade. Se a
          modalidade original tinha meta de distância, ela não vale mais — o
          registro de km aparece de novo só se a nova modalidade tiver essa
          métrica.
        </Text>

        {erro ? (
          <Notice
            tone="danger"
            title="Não foi possível carregar as modalidades"
            action={
              <Button
                label="Tentar novamente"
                variant="outline"
                compact
                onPress={onRecarregar}
              />
            }
          />
        ) : modalidades === null ? (
          <Skeleton
            height={160}
            radius={theme.borderRadius.lg}
            accessibilityLabel="Carregando modalidades aceitas"
          />
        ) : modalidades.length === 0 ? (
          <EmptyState
            icon="activity"
            title="Nenhuma modalidade cadastrada"
            description="Complete a anamnese de cardio no questionário para habilitar a troca."
          />
        ) : opcoes.length === 0 ? (
          <EmptyState
            icon="activity"
            title="Nenhuma outra modalidade disponível"
            description="A única modalidade que você aceita é esta. Complete a anamnese para adicionar outras."
          />
        ) : (
          <ScrollView style={styles.lista} keyboardShouldPersistTaps="handled">
            {opcoes.map((m) => {
              const selecionado = toModality === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.option, selecionado && styles.optionSelected]}
                  onPress={() => setToModality(m)}
                  disabled={busy}
                  testID={`swap-modality-${m}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selecionado, disabled: busy }}
                  accessibilityLabel={m}
                >
                  <Text
                    style={[styles.optionLabel, selecionado && styles.optionLabelSelected]}
                  >
                    {m}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {modalidades !== null && opcoes.length > 0 && !erro ? (
          <Button
            label="Trocar modalidade"
            onPress={() => {
              // Guarda de toque duplo e de seleção ausente: o servidor
              // recusaria com 22023, mas a tela não deve nem chegar lá.
              if (busy || toModality == null) return;
              onConfirm(toModality);
            }}
            disabled={busy || toModality == null}
            testID="swap-modality-confirm"
            style={styles.confirmar}
          />
        ) : null}
        <TouchableOpacity
          style={styles.cancelar}
          onPress={busy ? undefined : onDismiss}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Voltar sem trocar"
        >
          <Text style={styles.cancelarLabel}>Voltar</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  );
  if (inline) return content;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      {content}
    </Modal>
  );
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
  // Altura máxima em vez de flex: o sheet cresce com o conteúdo, mas a lista
  // não empurra o botão de confirmar fora da tela no telefone.
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
  confirmar: { marginTop: theme.spacing.md },
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

export default SwapModalitySheet;
