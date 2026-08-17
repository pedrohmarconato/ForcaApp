import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import {
  getLastStartFailed,
  subscribeLiveActivityStartFailure,
} from '../native/liveActivitySync';
import theme from '../theme/theme';

const MESSAGE =
  'Ative as Live Activities em Ajustes para ver o treino na tela bloqueada';

// Uma falha só pode gerar um aviso nesta execução do app. O guard fica fora do
// componente para sobreviver a remounts do root durante a navegação.
let hasShownUnavailableBanner = false;

const LiveActivityUnavailableBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;

    let cancelled = false;
    const showOnce = () => {
      if (cancelled || hasShownUnavailableBanner) return;
      hasShownUnavailableBanner = true;
      setVisible(true);
    };

    if (getLastStartFailed()) showOnce();
    const unsubscribe = subscribeLiveActivityStartFailure(showOnce);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (Platform.OS !== 'ios' || !visible) return null;

  return (
    <View style={styles.container} testID="live-activity-unavailable-banner">
      <Text style={styles.message}>{MESSAGE}</Text>
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
    backgroundColor: theme.colors.surface.card,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    ...theme.elevation.floating,
  },
  message: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.medium,
  },
});

export default LiveActivityUnavailableBanner;
