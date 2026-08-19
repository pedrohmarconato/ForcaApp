// src/components/ProvisioningBanner.tsx
// Aviso discreto e não-bloqueante de validade do provisioning profile
// (D-03, Fase 14 Plano 03). Molde visual/estrutural: UpdateBanner.tsx
// (faixa fixa na base da tela, nunca impede interação com o resto do app).
//
// Diferença chave: UpdateBanner reage a eventos da `window` (web-only);
// este componente lê UMA vez, no mount, um módulo nativo Expo
// (getProvisioningProfileExpiry() de modules/native-info) — só em iOS.
// Escopo mínimo (D-03): um aviso, não um sistema de notificação — sem
// botões de ação.
//
// Ausência do arquivo `embedded.mobileprovision` (esperada no Simulator)
// resolve como `null` do módulo nativo — o banner simplesmente não
// aparece, sem erro (RESEARCH.md Pattern 3 / Validation Architecture).

import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import theme from '../theme/theme';
import { getProvisioningProfileExpiry } from '../../modules/native-info';

// Pura, sem I/O: D-03 fixa "quando faltarem <=2 dias" — limite inclusivo,
// cobrindo o caso-limite de exatamente 2 dias (adjacência) e o caso já
// expirado (diferença negativa).
export function shouldShowProvisioningBanner(expiryDate: Date, now: Date): boolean {
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  return expiryDate.getTime() - now.getTime() <= TWO_DAYS_MS;
}

function formatWeekday(date: Date): string {
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date);
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

const ProvisioningBanner = () => {
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;

    let cancelled = false;
    getProvisioningProfileExpiry()
      .then((iso) => {
        if (cancelled || !iso) return;
        setExpiryDate(new Date(iso));
      })
      // WR-04 (14-REVIEW.md, 2026-08-19): a ponte nativa pode REJEITAR — perfil
      // de provisionamento ausente, plist ilegível, permissão negada. Sem este
      // catch a rejeição virava unhandled rejection em vez do comportamento
      // documentado em D-03: o aviso de validade é informativo, nunca
      // bloqueante, então falha de leitura mantém o banner oculto.
      .catch((e) => {
        console.warn('[provisioning] validade do perfil não pôde ser lida (não-fatal):', e);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (Platform.OS !== 'ios') return null;
  if (!expiryDate || !shouldShowProvisioningBanner(expiryDate, new Date())) return null;

  return (
    <View style={styles.container} testID="provisioning-banner">
      <Text style={styles.message}>Reassine até {formatWeekday(expiryDate)}</Text>
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

export default ProvisioningBanner;
