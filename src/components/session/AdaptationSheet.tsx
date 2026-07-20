// src/components/session/AdaptationSheet.tsx
// Fase 5 — bottom sheet pós-série. Mostra a recomendação de ajuste (a recomendada
// destacada) e o aluno ESCOLHE; nada é aplicado sem esse toque. Fechar pelo fundo =
// recusar (o chamador registra "manter" em set_logs.adaptation).
//
// Nota de implementação: usa o Modal nativo do RN em vez de @gorhom/bottom-sheet para
// não adicionar dependência nativa agora e manter o componente testável em jest.
// Trocar por um sheet com gesto/arrasto depois é um refino, não muda o contrato.

import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import theme from '../../theme/theme';
import type {
  Recommendation,
  Adjustment,
} from '../../engine/intraSessionAdaptation';

type Props = {
  /** null = escondido. Preenchido quando há uma série fora do alvo aguardando decisão. */
  recommendation: Recommendation | null;
  exerciseName: string;
  onChoose: (adjustment: Adjustment) => void;
  onDismiss: () => void;
};

const titleFor = (r: Recommendation): string => {
  if (r.outcome === 'under') return 'Você ficou abaixo do alvo';
  if (r.outcome === 'over') return 'Você passou do alvo';
  return 'Ajuste da próxima série';
};

const AdaptationSheet = ({
  recommendation,
  exerciseName,
  onChoose,
  onDismiss,
}: Props) => {
  return (
    <Modal
      visible={recommendation != null}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onDismiss}
        testID="adaptation-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Fechar e manter a carga"
      >
        {/* Absorve o toque no card para não fechar o sheet ao interagir com ele. */}
        <Pressable
          style={styles.card}
          onPress={() => undefined}
          accessibilityViewIsModal
          accessibilityLabel="Sugestão de ajuste da série"
        >
          {recommendation ? (
            <>
              <View style={styles.handle} />
              <Text style={styles.kicker}>{exerciseName}</Text>
              <Text style={styles.title} accessibilityRole="header">
                {titleFor(recommendation)}
              </Text>
              <Text style={styles.reason}>
                {recommendation.recommended.reason}
              </Text>
              {recommendation.options.map((opt, i) => {
                const isRecommended = i === 0;
                return (
                  <TouchableOpacity
                    key={`${opt.kind}-${i}`}
                    style={[
                      styles.option,
                      isRecommended && styles.optionRecommended,
                    ]}
                    onPress={() => onChoose(opt)}
                    testID={`adaptation-option-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isRecommended ? `${opt.label} (recomendado)` : opt.label
                    }
                    accessibilityHint={opt.reason}
                  >
                    <Text
                      style={[
                        styles.optionLabel,
                        isRecommended && styles.optionLabelRecommended,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isRecommended ? (
                      <Text style={styles.badge}>Recomendado</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: theme.colors.surface.card ?? '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.text.quiet,
    marginBottom: 12,
  },
  kicker: {
    color: theme.colors.text.quiet,
    fontSize: 13,
    marginBottom: 2,
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  reason: {
    color: theme.colors.text.secondary,
    fontSize: 14,
    marginTop: 6,
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  optionRecommended: {
    borderColor: theme.colors.accent.main,
    backgroundColor: 'rgba(235,255,0,0.08)',
  },
  optionLabel: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  optionLabelRecommended: {
    color: theme.colors.text.primary,
  },
  badge: {
    color: theme.colors.accent.main,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 12,
  },
});

export default AdaptationSheet;
