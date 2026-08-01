// src/screens/JointInviteScreen.tsx
// Treino Conjunto 2.0 — Sprint 02. O anfitrião cria e compartilha o convite.
//
// NADA NASCE DE MONTAGEM. O convite só existe depois de "Gerar convite" ser
// tocado. Criar no `useEffect` produziria sessões fantasma toda vez que a tela
// remontasse — por foco, por StrictMode, por reentrada.

import React, { useCallback, useRef, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import theme from '../theme/theme';
import { Button } from '../components/ui';
import { Card, Screen, ScreenTitle, SectionHeader } from '../components/ui/Surface';
import { Notice } from '../components/ui/Feedback';
import { StackHeader } from '../components/ui/Controls';
import { buildInviteLink } from '../navigation/inviteLink';
import * as repo from '../services/jointSessionRepository';

const layout = StyleSheet.create({
  coluna: { gap: theme.spacing.sm },
  // Tokens do tema — nenhum número solto. O código é o elemento dominante da
  // tela: é ele que a outra pessoa lê e digita.
  codigo: {
    fontFamily: theme.typography.fonts.display,
    fontSize: theme.typography.fontSizes.hero,
    color: theme.colors.text.primary,
    letterSpacing: theme.spacing.xs,
    textAlign: 'center',
  },
  link: {
    fontFamily: theme.typography.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
});

export type JointInviteScreenProps = {
  navigation: { goBack: () => void; navigate: (rota: string, params?: any) => void };
  /** Relógio injetável: a expiração é testada sem esperar 15 minutos. */
  agora?: () => number;
};

const formatarRestante = (expiraEm: string, agoraMs: number): string => {
  const restanteMs = Date.parse(expiraEm) - agoraMs;
  if (!Number.isFinite(restanteMs) || restanteMs <= 0) return 'expirado';
  const minutos = Math.floor(restanteMs / 60_000);
  return minutos >= 1 ? `expira em ${minutos} min` : 'expira em menos de 1 min';
};

const JointInviteScreen = ({ navigation, agora = () => Date.now() }: JointInviteScreenProps) => {
  const [convite, setConvite] = useState<repo.JointInvite | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [emCurso, setEmCurso] = useState(false);
  // Trava de reentrada: dois toques com a Promise pendente viram UMA chamada.
  const chamando = useRef(false);

  const gerar = useCallback(async () => {
    if (chamando.current) return;
    chamando.current = true;
    setEmCurso(true);
    setErro(null);
    try {
      const novo = await repo.createJointSession();
      // A resposta substitui código, link e expiração ATOMICAMENTE: o antigo
      // deixa de aparecer no mesmo instante em que o novo entra.
      setConvite(novo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o convite.');
    } finally {
      chamando.current = false;
      setEmCurso(false);
    }
  }, []);

  const compartilhar = useCallback(async () => {
    if (!convite) return;
    try {
      const r = await Share.share({
        message: `Treine comigo no Força: ${buildInviteLink(convite.inviteCode)}`,
      });
      // Cancelar não é erro de produto — o usuário mudou de ideia.
      if ((r as any)?.action === Share.dismissedAction) return;
    } catch (e) {
      setErro('Não foi possível abrir o compartilhamento.');
    }
  }, [convite]);

  const expirado = convite ? formatarRestante(convite.inviteExpiresAt, agora()) === 'expirado' : false;

  return (
    <Screen>
      <StackHeader title="Convidar alguém" onBack={() => navigation.goBack()} />
      <ScreenTitle title="Treinar junto" />

      {erro ? <Notice tone="danger" title={erro} testID="erro-convite" /> : null}

      {!convite ? (
        <Card>
          <SectionHeader title="Gere um convite" />
          <Notice
            tone="info"
            title="Quem entrar recebe um código de 6 caracteres"
            description="Você pode compartilhar o link ou ditar o código."
          />
          <Button
            label="Gerar convite"
            loading={emCurso}
            disabled={emCurso}
            onPress={gerar}
            testID="gerar-convite"
          />
        </Card>
      ) : (
        <Card testID="convite-pronto">
          <SectionHeader title="Código do convite" />
          <Text style={layout.codigo} testID="codigo">{convite.inviteCode}</Text>
          <Text style={layout.link} testID="link">{buildInviteLink(convite.inviteCode)}</Text>
          <Notice
            tone={expirado ? 'warning' : 'info'}
            title={formatarRestante(convite.inviteExpiresAt, agora())}
            testID="expiracao"
          />
          <View style={layout.coluna}>
            <Button
              label="Compartilhar"
              onPress={compartilhar}
              disabled={emCurso || expirado}
              testID="compartilhar"
            />
            <Button
              label="Gerar novo convite"
              variant="outline"
              loading={emCurso}
              disabled={emCurso}
              onPress={gerar}
              testID="rotacionar"
            />
            <Button
              label="Ir para o lobby"
              variant="ghost"
              onPress={() => navigation.navigate('JointLobby', { jointSessionId: convite.session.id })}
              testID="ir-lobby"
            />
          </View>
        </Card>
      )}
    </Screen>
  );
};

export default JointInviteScreen;
