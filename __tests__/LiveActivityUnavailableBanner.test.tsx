import React from 'react';
import { Platform } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

import LiveActivityUnavailableBanner from '../src/components/LiveActivityUnavailableBanner';
import {
  getLastStartFailed,
  subscribeLiveActivityStartFailure,
} from '../src/native/liveActivitySync';

jest.mock('../src/native/liveActivitySync', () => ({
  getLastStartFailed: jest.fn(),
  subscribeLiveActivityStartFailure: jest.fn(() => jest.fn()),
}));

const mockedGetLastStartFailed = getLastStartFailed as jest.Mock;
const mockedSubscribe = subscribeLiveActivityStartFailure as jest.Mock;

const FULL_MESSAGE =
  'Ative as Live Activities em Ajustes para ver o treino na tela bloqueada';

describe('LiveActivityUnavailableBanner', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');

  afterEach(() => {
    if (descriptor) Object.defineProperty(Platform, 'OS', descriptor);
    mockedGetLastStartFailed.mockReset();
    mockedSubscribe.mockReset();
    mockedSubscribe.mockReturnValue(jest.fn());
  });

  it('fora do iOS renderiza null e não consulta o estado nativo', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });

    const screen = render(<LiveActivityUnavailableBanner />);

    expect(screen.queryByTestId('live-activity-unavailable-banner')).toBeNull();
    expect(mockedGetLastStartFailed).not.toHaveBeenCalled();
    expect(mockedSubscribe).not.toHaveBeenCalled();
  });

  it('no iOS permanece invisível quando o último start teve sucesso', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    mockedGetLastStartFailed.mockReturnValue(false);

    const screen = render(<LiveActivityUnavailableBanner />);

    expect(screen.queryByTestId('live-activity-unavailable-banner')).toBeNull();
    expect(mockedSubscribe).toHaveBeenCalledTimes(1);
  });

  it('mostra a falha uma vez e não repete o aviso após remount na mesma sessão', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    mockedGetLastStartFailed.mockReturnValue(true);
    let notifyFailure: (() => void) | undefined;
    mockedSubscribe.mockImplementation((listener: () => void) => {
      notifyFailure = listener;
      return jest.fn();
    });

    const first = render(<LiveActivityUnavailableBanner />);
    await waitFor(() => {
      expect(first.getByTestId('live-activity-unavailable-banner')).toBeTruthy();
    });
    expect(first.getByText(FULL_MESSAGE)).toBeTruthy();
    expect(first.getByText(FULL_MESSAGE).props.numberOfLines).toBeUndefined();

    act(() => notifyFailure?.());
    expect(first.getAllByTestId('live-activity-unavailable-banner')).toHaveLength(1);

    first.unmount();
    mockedGetLastStartFailed.mockReturnValue(false);
    const second = render(<LiveActivityUnavailableBanner />);
    act(() => notifyFailure?.());

    expect(second.queryByTestId('live-activity-unavailable-banner')).toBeNull();
  });
});
