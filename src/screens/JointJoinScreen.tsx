// src/screens/JointJoinScreen.tsx
// Treino Conjunto 2.0 — Sprint 02. Entrar com o código.
//
// O código pode chegar digitado ou por deep link. Quando vem do link, a tela
// abre PREENCHIDA e espera a ação — entrar sozinho tiraria do usuário a decisão
// de aceitar um convite.
//
// E a mensagem de recusa é UMA SÓ: código inexistente, expirado, já consumido e
// limite de tentativas produzem o mesmo texto. Distinguir seria transformar a
// tela num oráculo que ajuda a adivinhar convites alheios.

import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import theme from '../theme/theme';
import { Button, TextField } from '../components/ui';
import { Card, Screen, ScreenTitle, SectionHeader } from '../components/ui/Surface';
import { Notice } from '../components/ui/Feedback';
import { StackHeader } from '../components/ui/Controls';
import { isCodigoDeConvite } from '../navigation/inviteLink';
import * as repo from '../services/jointSessionRepository';

const TAMANHO = 6;
const MENSAGEM_GENERICA = 'Convite inválido ou expirado. Peça um novo código.';

const layout = StyleSheet.create({
  campo: { letterSpacing: theme.spacing.xs, textAlign: 'center' },
});

export type JointJoinScreenProps = {
  navigation: { goBack: () => void; navigate: (rota: string, params?: any) => void };
  route?: { params?: { code?: string } };
};

const JointJoinScreen = ({ navigation, route }: JointJoinScreenProps) => {
  const [codigo, setCodigo] = useState<string>((route?.params?.code ?? '').toUpperCase());
  const [erro, setErro] = useState<string | null>(null);
  const [emCurso, setEmCurso] = useState(false);
  const chamando = useRef(false);

  const aoDigitar = useCallback((valor: string) => {
    // Normaliza e limita: o código é lido na tela de outra pessoa.
    setCodigo(valor.toUpperCase().slice(0, TAMANHO));
    setErro(null);
  }, []);

  const entrar = useCallback(async () => {
    if (chamando.current) return;
    chamando.current = true;
    setEmCurso(true);
    setErro(null);
    try {
      const sessao = await repo.joinJointSession(codigo);
      navigation.navigate('JointLobby', { jointSessionId: sessao.id });
    } catch {
      // Uma mensagem só, para todos os motivos.
      setErro(MENSAGEM_GENERICA);
    } finally {
      chamando.current = false;
      setEmCurso(false);
    }
  }, [codigo, navigation]);

  const habilitado = isCodigoDeConvite(codigo) && !emCurso;

  return (
    <Screen>
      <StackHeader title="Entrar com código" onBack={() => navigation.goBack()} />
      <ScreenTitle title="Treinar junto" />
      <Card>
        <SectionHeader title="Código do convite" />
        <TextField
          label="Código"
          value={codigo}
          onChangeText={aoDigitar}
          autoCapitalize="characters"
          maxLength={TAMANHO}
          style={layout.campo}
          testID="campo-codigo"
        />
        {erro ? <Notice tone="danger" title={erro} testID="erro-entrar" /> : null}
        <Button
          label="Entrar no treino"
          disabled={!habilitado}
          loading={emCurso}
          onPress={entrar}
          testID="entrar"
        />
      </Card>
    </Screen>
  );
};

export default JointJoinScreen;
