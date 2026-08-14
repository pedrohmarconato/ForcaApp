// __tests__/alertShim.test.ts
// Repasse nativo do shim (D-03, WEB-01). Prova que Platform.OS !== 'web'
// nunca toca o alertStore — showAlert vira uma chamada pura para
// Alert.alert real, sem mudança de comportamento no nativo. Molde de
// Platform.OS mutado direto (sem module registry):
// __tests__/direcao03-fase1-fundacoes.test.tsx.

import { Alert, Platform } from 'react-native';

import { showAlert } from '../src/utils/alertShim';
import { useAlertStore } from '../src/store/alertStore';

describe('alertShim — repasse nativo (D-03)', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    (Platform as { OS: string }).OS = 'ios';
  });

  afterEach(() => {
    (Platform as { OS: string }).OS = originalOS;
    jest.restoreAllMocks();
  });

  it('no nativo repassa puro para Alert.alert com os mesmos argumentos', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    showAlert('t', 'm', [{ text: 'OK' }]);

    expect(alertSpy).toHaveBeenCalledWith('t', 'm', [{ text: 'OK' }]);
  });

  it('no nativo o branch web nunca é tocado — alertStore.current permanece null', () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    showAlert('t', 'm', [{ text: 'OK' }]);

    expect(useAlertStore.getState().current).toBeNull();
  });
});
