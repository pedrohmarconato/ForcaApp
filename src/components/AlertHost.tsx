// src/components/AlertHost.tsx
// Substituto visual de Alert.alert no web (WEB-01, D-02). Monta um único
// Modal custom lendo o alertStore — nunca window.alert/window.confirm (D-02):
// essas APIs bloqueiam a thread e não combinam com o resto da UI React
// Native. Molde visual: SwapModalitySheet.tsx (Modal + Pressable backdrop +
// card + StyleSheet com tokens do theme).
//
// Montado uma única vez em App.tsx dentro de AuthProvider (D-04) — ponto de
// composição global, igual a StatusBar/RootNavigator.

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAlertStore, type AlertButton } from '../store/alertStore';
import { useTheme, useThemeStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

const DEFAULT_BUTTONS: AlertButton[] = [{ text: 'OK' }];

const AlertHost = () => {
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);
  const current = useAlertStore((s) => s.current);
  const dismiss = useAlertStore((s) => s.dismiss);

  if (!current) return null;

  const buttons = current.buttons && current.buttons.length > 0 ? current.buttons : DEFAULT_BUTTONS;

  // WR-03/WR-02: dismiss-sem-botão não pode pular o onPress de um botão do
  // jeito que Alert.alert nativo garante. Alert.alert de botão único é
  // bloqueante no iOS (só sai pelo botão) — mirror aqui: com 1 botão só,
  // essa tentativa de dismiss não faz nada, forçando o toque no botão (e o
  // onPress dele) para fechar. Com 2+ botões, mirrora o back-dismiss nativo
  // do Android, que aciona o botão style="cancel" quando existe; sem
  // cancel, vira dismiss neutro (nenhum onPress), documentado como a
  // divergência deliberada do native para esse caso. Compartilhado entre o
  // backdrop Pressable e o Modal onRequestClose (que no react-native-web é
  // ligado a um listener de keyup no Escape — WR-02, iteração 2: deixar
  // onRequestClose chamando dismiss() diretamente reabre o mesmo bug do
  // WR-03 por um caminho de teclado em vez de toque no backdrop).
  const handleDismissAttempt = () => {
    if (buttons.length <= 1) return;
    const botaoCancelar = buttons.find((b) => b.style === 'cancel');
    dismiss();
    botaoCancelar?.onPress?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismissAttempt}>
      <Pressable
        style={styles.backdrop}
        onPress={handleDismissAttempt}
        testID="alert-host-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Fechar"
      >
        <Pressable
          style={styles.card}
          onPress={() => undefined}
          accessibilityViewIsModal
          accessibilityLabel={current.title}
        >
          <Text style={styles.title} accessibilityRole="header">
            {current.title}
          </Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={styles.buttons}>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={`${b.text}-${i}`}
                style={styles.button}
                testID={`alert-host-button-${i}`}
                accessibilityRole="button"
                accessibilityLabel={b.text}
                onPress={() => {
                  dismiss();
                  b.onPress?.();
                }}
              >
                <Text
                  style={[
                    styles.buttonLabel,
                    b.style === 'destructive' && { color: theme.colors.status.danger },
                  ]}
                >
                  {b.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.overlay,
      padding: theme.spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      padding: theme.spacing.xl,
      borderRadius: theme.borderRadius.xxl,
      backgroundColor: theme.colors.surface.card,
      ...theme.elevation.floating,
    },
    title: {
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.lg,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
    message: {
      marginTop: theme.spacing.sm,
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.base,
      lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
    },
    buttons: {
      marginTop: theme.spacing.xl,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.lg,
    },
    button: {
      minHeight: theme.hitTarget.compact,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.md,
    },
    buttonLabel: {
      color: theme.colors.text.accent,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.base,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
  });

export default AlertHost;
