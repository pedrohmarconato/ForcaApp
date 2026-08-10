// __tests__/skipReasonSheetTroca.test.tsx
// REQ-06, segundo entry point (Fase 3, Plano 03-04): SkipReasonSheet oferece
// "Trocar modalidade" como alternativa a "Recusar mesmo assim" quando o
// motivo selecionado é sem_equipamento E o exercício é de cardio. Molde de
// teste: __tests__/swapModalitySheet.test.tsx.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import SkipReasonSheet from '../src/components/session/SkipReasonSheet';

describe('SkipReasonSheet — entry point 2 da troca de modalidade (REQ-06)', () => {
  it('não-cardio, sem_equipamento: nenhum botão de troca aparece, rótulo permanece "Não vou fazer"', () => {
    const screen = render(
      <SkipReasonSheet
        inline
        visible
        escopo="exercicio"
        alvo="Supino reto"
        ehCardio={false}
        onSolicitarTroca={jest.fn()}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('skip-reason-sem_equipamento'));
    expect(screen.queryByTestId('skip-reason-oferecer-troca')).toBeNull();
    expect(screen.getByText('Não vou fazer')).toBeTruthy();
  });

  it('cardio, outro motivo: nenhum botão de troca aparece (ramo é específico de sem_equipamento)', () => {
    const screen = render(
      <SkipReasonSheet
        inline
        visible
        escopo="exercicio"
        alvo="Corrida"
        ehCardio
        onSolicitarTroca={jest.fn()}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('skip-reason-cansaco'));
    expect(screen.queryByTestId('skip-reason-oferecer-troca')).toBeNull();
  });

  it('cardio + sem_equipamento: botão de troca aparece e o botão principal muda para "Recusar mesmo assim"', () => {
    const screen = render(
      <SkipReasonSheet
        inline
        visible
        escopo="exercicio"
        alvo="Corrida"
        ehCardio
        onSolicitarTroca={jest.fn()}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('skip-reason-sem_equipamento'));
    expect(screen.getByTestId('skip-reason-oferecer-troca')).toBeTruthy();
    expect(screen.getByText('Recusar mesmo assim')).toBeTruthy();
  });

  it('troca não confirma recusa: pressionar "Trocar modalidade" chama onSolicitarTroca e NUNCA onConfirm', () => {
    const onSolicitarTroca = jest.fn();
    const onConfirm = jest.fn();
    const screen = render(
      <SkipReasonSheet
        inline
        visible
        escopo="exercicio"
        alvo="Corrida"
        ehCardio
        onSolicitarTroca={onSolicitarTroca}
        onConfirm={onConfirm}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('skip-reason-sem_equipamento'));
    fireEvent.press(screen.getByTestId('skip-reason-oferecer-troca'));
    expect(onSolicitarTroca).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('recusar mesmo assim continua funcionando: pressionar skip-reason-confirm chama onConfirm normalmente', () => {
    const onConfirm = jest.fn();
    const onSolicitarTroca = jest.fn();
    const screen = render(
      <SkipReasonSheet
        inline
        visible
        escopo="exercicio"
        alvo="Corrida"
        ehCardio
        onSolicitarTroca={onSolicitarTroca}
        onConfirm={onConfirm}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('skip-reason-sem_equipamento'));
    fireEvent.press(screen.getByTestId('skip-reason-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('sem_equipamento', null);
    expect(onSolicitarTroca).not.toHaveBeenCalled();
  });

  it('escopo sessão nunca oferece troca, mesmo com ehCardio e sem_equipamento', () => {
    const screen = render(
      <SkipReasonSheet
        inline
        visible
        escopo="sessao"
        alvo="Treino de hoje"
        ehCardio
        onSolicitarTroca={jest.fn()}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('skip-reason-sem_equipamento'));
    expect(screen.queryByTestId('skip-reason-oferecer-troca')).toBeNull();
  });
});
