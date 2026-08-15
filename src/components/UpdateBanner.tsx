// src/components/UpdateBanner.tsx
// Aviso não-bloqueante de atualização do service worker (OFF-02, Fase 11
// Plano 02). Molde visual/estrutural: AlertHost.tsx (host global montado uma
// vez em App.tsx, lendo um store dedicado). Diferença chave: AlertHost é um
// Modal bloqueante; este banner é uma faixa fixa na base da tela que nunca
// impede interação com o resto do app — uma atualização chegando durante uma
// sessão de treino ativa não pode travar nada.
//
// Web-only: fora do 'web', retorna null imediatamente e nunca registra
// listener na window — o CustomEvent do register-sw.js (Plano 11-01) só
// existe no DOM do navegador.
//
// Contrato de eventos com register-sw.js (11-01-SUMMARY.md):
//   - escuta 'sw-update-available' -> setWaiting(true) -> banner renderiza.
//   - toque em "Atualizar" -> updateStore.applyUpdate() -> despacha
//     'sw-apply-update' -> register-sw.js manda SKIP_WAITING pro worker em
//     espera -> 'controllerchange' -> reload único (guarda `refreshing` em
//     register-sw.js). Este componente NUNCA chama reload diretamente, em
//     nenhum caminho — essa responsabilidade é exclusiva de register-sw.js.
//   - toque em "Depois" -> updateStore.dismiss() -> banner some, nenhum
//     evento é despachado; a versão nova só entra na próxima abertura
//     natural do app.

import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import theme from '../theme/theme';
import { useUpdateStore } from '../store/updateStore';

const UpdateBanner = () => {
  const waiting = useUpdateStore((s) => s.waiting);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const setWaiting = useUpdateStore((s) => s.setWaiting);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const applyUpdate = useUpdateStore((s) => s.applyUpdate);

  // Montagem única: só escuta a window no branch web. Fora do web, o efeito
  // não registra nada — não há CustomEvent nem window.addEventListener
  // funcional fora de um DOM real.
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const handleUpdateAvailable = () => setWaiting(true);
    window.addEventListener('sw-update-available', handleUpdateAvailable);
    return () => window.removeEventListener('sw-update-available', handleUpdateAvailable);
  }, [setWaiting]);

  if (Platform.OS !== 'web') return null;
  if (!waiting || dismissed) return null;

  return (
    <View style={styles.container} testID="update-banner">
      <Text style={styles.message}>Nova versão disponível</Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Depois"
        >
          <Text style={styles.buttonSecondaryLabel}>Depois</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={applyUpdate}
          accessibilityRole="button"
          accessibilityLabel="Atualizar"
        >
          <Text style={styles.buttonPrimaryLabel}>Atualizar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: theme.zIndex.toast,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface.card,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.elevation.floating,
  },
  message: {
    flex: 1,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.medium,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  buttonSecondary: {
    minHeight: theme.hitTarget.compact,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  buttonSecondaryLabel: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.medium,
  },
  buttonPrimary: {
    minHeight: theme.hitTarget.compact,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  buttonPrimaryLabel: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
});

export default UpdateBanner;
