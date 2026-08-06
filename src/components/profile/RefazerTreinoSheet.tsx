// src/components/profile/RefazerTreinoSheet.tsx
// Confirmação do "Refazer treino" do Perfil: arquivar o plano atual e gerar um
// novo a partir de um questionário atualizado. As sessões concluídas seguem no
// histórico — por isso o verbo é "refazer", não "destruir".
//
// Estados:
//  - verificando → checagem do guard em curso (spinner); NUNCA mostra o
//    veredito da rodada anterior, e o cancelamento continua livre;
//  - bloqueado  → há sessão em andamento: só aviso + fechar, sem CTA;
//  - normal     → confirmação com CTA e cancelar.
//
// Mesmo molde do ReorderScopeSheet/CardioGoalSheet: Modal nativo do RN, sem
// dependência nativa, testável em jest.

import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import theme from '../../theme/theme';
import Button from '../ui/Button';

type Props = {
  visible: boolean;
  /** Uma sessão do plano ativo está em andamento: só aviso + fechar. */
  bloqueadoPorSessaoEmAndamento: boolean;
  /** Consulta ao guard em curso: mostra o spinner e não expõe o CTA. */
  verificando: boolean;
  onConfirmar: () => void;
  onDismiss: () => void;
};

const RefazerTreinoSheet = ({
  visible,
  bloqueadoPorSessaoEmAndamento,
  verificando,
  onConfirmar,
  onDismiss,
}: Props) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
    {/* Dismiss SEMPRE liberado: dispensar durante a checagem é inócuo (os
        setState pós-await acontecem com o sheet fechado) e o usuário nunca
        fica preso no modal. */}
    <Pressable
      style={styles.backdrop}
      onPress={onDismiss}
      testID="refazer-treino-backdrop"
      accessibilityRole="button"
      accessibilityLabel="Fechar sem refazer o treino"
    >
      {/* Absorve o toque no card para não fechar o sheet ao interagir com ele. */}
      <Pressable
        style={styles.card}
        onPress={() => undefined}
        accessibilityViewIsModal
        accessibilityLabel={
          verificando
            ? 'Verificando treino em andamento'
            : bloqueadoPorSessaoEmAndamento
              ? 'Treino em andamento'
              : 'Refazer seu treino'
        }
      >
        <View style={styles.handle} />
        <Text style={styles.kicker}>Plano de treino</Text>
        {verificando ? (
          <>
            <View style={styles.checando}>
              <ActivityIndicator
                size="small"
                color={theme.colors.text.quiet}
                accessibilityLabel="Verificando se há treino em andamento"
              />
              <Text style={styles.checandoText}>Checando se há um treino em andamento...</Text>
            </View>
            <TouchableOpacity
              style={styles.cancelar}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <Text style={styles.cancelarLabel}>Cancelar</Text>
            </TouchableOpacity>
          </>
        ) : bloqueadoPorSessaoEmAndamento ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              Treino em andamento
            </Text>
            <Text style={styles.description}>
              Você tem um treino em andamento. Termine ou saia dele antes de gerar um novo plano.
            </Text>
            <Button
              label="Fechar"
              variant="tonal"
              onPress={onDismiss}
              testID="refazer-treino-fechar"
            />
          </>
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header">
              Refazer seu treino?
            </Text>
            <Text style={styles.description}>
              Seu plano atual é arquivado e um novo é gerado a partir de um questionário
              atualizado. Suas sessões concluídas continuam no seu histórico.
            </Text>
            <Button
              label="Continuar para o questionário"
              variant="tonal"
              onPress={onConfirmar}
              testID="refazer-treino-confirmar"
            />
            <TouchableOpacity
              style={styles.cancelar}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <Text style={styles.cancelarLabel}>Cancelar</Text>
            </TouchableOpacity>
          </>
        )}
      </Pressable>
    </Pressable>
  </Modal>
);

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
    marginBottom: theme.spacing.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
  },
  checando: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  checandoText: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    textAlign: 'center',
  },
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

export default RefazerTreinoSheet;
