// src/components/session/SessionQueue.tsx
// Redesign da sessão — a fila compacta embaixo do player: todo o treino num
// relance, uma LINHA por série (nada de cards com botões repetidos).
//   ✓ feita  → resultado real (reps × carga · fôlego)
//   → agora  → série ativa no player
//   · alvo   → pendente; tocar pula direto para ela (flexibilidade preservada)

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, useThemeStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import {
  metricOf,
  isTimeBased,
  exercicioForaDeJogo,
  doneLine,
  SKIP_REASON_LABELS,
  type SessionDraft,
  type DraftExercise,
  type DraftSet,
} from '../../engine/sessionModel';
import { useActiveSessionStore } from '../../store/activeSessionStore';
import { alvoDaSerie } from './SessionPlayer';

type Props = {
  draft: SessionDraft;
  /** Meta do exercício vinda do plano (ex.: "4 séries × 8-10 · 80% RM · descanso 90s"). */
  metaFor: (exercise: DraftExercise) => string | null;
  /**
   * Abre o sheet de recusa para este exercício (a tela é dona do sheet). Sem o
   * callback, a fila não oferece a ação — é como as telas antigas a renderizam.
   */
  onSolicitarRecusa?: (exercise: DraftExercise) => void;
  /**
   * Abre o sheet de troca de modalidade para este exercício de cardio (a tela
   * é dona do sheet, mesmo padrão de onSolicitarRecusa). Sem o callback, a
   * fila não oferece a ação.
   */
  onSolicitarTroca?: (exercise: DraftExercise) => void;
  /** Override para ativar série (modal fecha antes de navegar). */
  onActivateSet?: (exerciseId: string, setOrder: number) => void;
  /** Override para desfazer recusa (modal fecha antes de agir). */
  onUnskipExercise?: (exerciseId: string) => void;
};

// Re-export preserva o contrato público do componente (consumidores existentes
// importam daqui); a implementação mora no motor puro — WR-01.
export { doneLine };

const SessionQueue = ({
  draft,
  metaFor,
  onSolicitarRecusa,
  onSolicitarTroca,
  onActivateSet,
  onUnskipExercise,
}: Props) => {
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);
  const storeActivateSet = useActiveSessionStore((s) => s.activateSet);
  const storeUnskipExercise = useActiveSessionStore((s) => s.unskipExercise);
  const activateSet = onActivateSet ?? storeActivateSet;
  const unskipExercise = onUnskipExercise ?? storeUnskipExercise;

  return (
    <View>
      {draft.exercises.map((ex, idxEx) => {
        const recusado = ex.skippedByUser === true;
        const foraDeJogo = exercicioForaDeJogo(ex);
        // Fora de jogo mostra só o que foi realmente feito: listar séries que
        // não serão executadas convida a tocá-las e reabrir o exercício.
        const series = foraDeJogo
          ? ex.sets.filter((s) => s.status === 'done')
          : ex.sets;
        const meta = metaFor(ex);
        return (
          <View key={ex.exerciseId} style={styles.block}>
            <View style={styles.headerRow}>
              <Text style={styles.order}>
                {String(idxEx + 1).padStart(2, '0')}
              </Text>
              <View style={styles.headerText}>
                <Text style={[styles.name, foraDeJogo && styles.nameCut]}>
                  {ex.name}
                </Text>
                {recusado ? (
                  <Text style={styles.cutNote}>
                    {`Você não vai fazer hoje — ${(ex.skipReason
                      ? SKIP_REASON_LABELS[ex.skipReason]
                      : 'motivo não registrado'
                    ).toLowerCase()}. O exercício segue nas próximas semanas.`}
                  </Text>
                ) : ex.cutByReplan === true ? (
                  <Text style={styles.cutNote}>
                    Cortado por tempo — confirmado por você. As séries não
                    feitas não contam hoje.
                  </Text>
                ) : ex.swappedFrom ? (
                  <Text
                    style={styles.cutNote}
                  >{`Trocado de ${ex.swappedFrom}.`}</Text>
                ) : meta ? (
                  <Text style={styles.meta}>{meta}</Text>
                ) : null}
              </View>
              {/* Recusar só faz sentido no que ainda está em jogo; desfazer, só
                  no que ELE recusou (corte por tempo é decisão de outro nível). */}
              {recusado ? (
                <TouchableOpacity
                  style={styles.acao}
                  onPress={() => unskipExercise(ex.exerciseId)}
                  testID={`unskip-${ex.exerciseId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Voltar a fazer ${ex.name}`}
                >
                  <Text style={styles.acaoLabel}>Voltar a fazer</Text>
                </TouchableOpacity>
              ) : onSolicitarRecusa && !foraDeJogo ? (
                <TouchableOpacity
                  style={styles.acao}
                  onPress={() => onSolicitarRecusa(ex)}
                  testID={`skip-${ex.exerciseId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Não vou fazer ${ex.name}`}
                >
                  <Text style={styles.acaoLabel}>Não vou fazer</Text>
                </TouchableOpacity>
              ) : null}
              {onSolicitarTroca &&
              !foraDeJogo &&
              isTimeBased(metricOf(ex)) &&
              !ex.sets.some((s) => s.status === 'done') ? (
                <TouchableOpacity
                  style={styles.acao}
                  onPress={() => onSolicitarTroca(ex)}
                  testID={`swap-${ex.exerciseId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Trocar modalidade de ${ex.name}`}
                >
                  <Text style={styles.acaoLabel}>Trocar modalidade</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {series.map((s) => {
              if (s.status === 'done') {
                return (
                  <View key={s.plannedSetId} style={styles.row}>
                    <Text style={styles.mark}>✓</Text>
                    <Text style={styles.rowLabel}>S{s.setOrder}</Text>
                    <Text style={styles.rowDone}>{doneLine(ex, s)}</Text>
                    {s.outcome === 'under' ? (
                      <Text
                        style={[
                          styles.outcome,
                          { color: theme.colors.status.warning },
                        ]}
                      >
                        abaixo
                      </Text>
                    ) : s.outcome === 'over' ? (
                      <Text
                        style={[
                          styles.outcome,
                          { color: theme.colors.status.info },
                        ]}
                      >
                        acima
                      </Text>
                    ) : null}
                  </View>
                );
              }
              if (s.status === 'active') {
                return (
                  <View
                    key={s.plannedSetId}
                    style={[styles.row, styles.rowActive]}
                  >
                    <Text style={[styles.mark, styles.markActive]}>→</Text>
                    <Text style={[styles.rowLabel, styles.rowLabelActive]}>
                      S{s.setOrder}
                    </Text>
                    <Text style={styles.rowActiveText}>
                      agora, no card acima
                    </Text>
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  key={s.plannedSetId}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={`Pular para a série ${s.setOrder} de ${ex.name}`}
                  onPress={() => activateSet(ex.exerciseId, s.setOrder)}
                >
                  <Text style={styles.markPending}>·</Text>
                  <Text style={styles.rowLabel}>S{s.setOrder}</Text>
                  <Text style={styles.rowPending}>
                    alvo {alvoDaSerie(ex, s)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    block: { marginBottom: theme.spacing.xl },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    },
    order: {
      color: theme.colors.text.quiet,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
      lineHeight: theme.typography.fontSizes.md * 1.35,
    },
    headerText: { flex: 1 },
    name: {
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.md,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
    nameCut: {
      color: theme.colors.text.quiet,
      textDecorationLine: 'line-through',
    },
    meta: {
      marginTop: 2,
      color: theme.colors.text.quiet,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.xs,
    },
    cutNote: {
      marginTop: 2,
      color: theme.colors.text.quiet,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.xs,
      fontStyle: 'italic',
    },
    acao: {
      minHeight: theme.hitTarget.compact,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.sm,
    },
    acaoLabel: {
      color: theme.colors.text.quiet,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.xs,
      fontWeight: theme.typography.fontWeights.semiBold,
      textDecorationLine: 'underline',
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      minHeight: theme.hitTarget.compact,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
    },
    rowActive: { backgroundColor: theme.colors.accent.soft },
    mark: {
      width: 16,
      textAlign: 'center',
      color: theme.colors.status.success,
    },
    markActive: { color: theme.colors.text.accent },
    markPending: {
      width: 16,
      textAlign: 'center',
      color: theme.colors.text.quiet,
      fontSize: theme.typography.fontSizes.lg,
    },
    rowLabel: {
      width: 28,
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
    rowLabelActive: { color: theme.colors.text.accent },
    rowDone: {
      flex: 1,
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
    },
    rowActiveText: {
      flex: 1,
      color: theme.colors.text.accent,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
    rowPending: {
      flex: 1,
      color: theme.colors.text.quiet,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
    },
    outcome: {
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.xs,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
  });

export default SessionQueue;
