import React, { Suspense } from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

let mockAuthState: {
  user: { id: string } | null;
  profile: { id: string; neon_color?: unknown } | null;
} = { user: null, profile: null };
let mockRequireAuthBoundary = false;
let mockRootMounts = 0;

// ThemeProvider não chama mais useAuth() internamente (fix da coesão
// tema/auth) — quem instancia <ThemeProvider> direto neste arquivo precisa
// repassar userId/profile por prop, lidos do mesmo mockAuthState que antes
// alimentava o useAuth() mockado. `<App />` (describe "integração da árvore
// raiz") continua sem isso: o bridge fica em App.tsx.
const authThemeProps = () => ({
  userId: mockAuthState.user?.id ?? null,
  profile: mockAuthState.profile,
});

const mockSingle = jest.fn();
const mockSelect = jest.fn(() => ({ single: mockSingle }));
const mockEq = jest.fn(() => ({ select: mockSelect }));
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({ update: mockUpdate }));

jest.mock('../src/contexts/AuthContext', () => {
  const React = require('react');
  const AuthBoundary = React.createContext(false);
  return {
    AuthProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthBoundary.Provider, { value: true }, children),
    useAuth: () => {
      const insideAuthProvider = React.useContext(AuthBoundary);
      if (mockRequireAuthBoundary && !insideAuthProvider) {
        throw new Error('ThemeProvider fora de AuthProvider');
      }
      return mockAuthState;
    },
  };
});

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

jest.mock('react-native-gesture-handler', () => ({}));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('../src/navigation/RootNavigator', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const RootNavigatorProbe = () => {
    const { useTheme } = require('../src/theme/ThemeProvider');
    const { neonColor } = useTheme();
    React.useEffect(() => {
      mockRootMounts += 1;
    }, []);
    return React.createElement(Text, { testID: 'root-theme' }, neonColor);
  };
  return { __esModule: true, default: RootNavigatorProbe };
});
jest.mock('../src/components/AlertHost', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/components/UpdateBanner', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/components/ProvisioningBanner', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/components/LiveActivityUnavailableBanner', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/components/PushInviteHost', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/native/liveActivitySync', () => ({
  initLiveActivitySync: jest.fn(() => jest.fn()),
  reconcileOrphanActivities: jest.fn(async () => undefined),
}));
jest.mock('../src/native/liveActivityIntentBridge', () => ({
  registerLiveActivityIntentListener: jest.fn(() => jest.fn()),
}));

import defaultTheme, {
  createTheme,
  NEON_COLORS,
  NEON_COLOR_KEYS,
  parseNeonColor,
  type NeonColorKey,
} from '../src/theme/theme';
import {
  ThemeProvider,
  useTheme,
  useThemeStyles,
} from '../src/theme/ThemeProvider';
import { neonPreferenceRepository } from '../src/services/neonPreferenceRepository';
import App from '../App';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const luminance = (hex: string) => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (foreground: string, background: string) => {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
};

let currentThemeContext: ReturnType<typeof useTheme> | null = null;

const ThemeProbe = () => {
  const value = useTheme();
  currentThemeContext = value;
  return (
    <>
      <Text testID="neon-color">{value.neonColor}</Text>
      <Text testID="confirmed-color">{value.confirmedNeonColor}</Text>
      <Text testID="theme-main">{value.theme.colors.accent.main}</Text>
      <Text testID="save-status">{value.status}</Text>
      <Text testID="save-message">{value.message ?? 'sem-mensagem'}</Text>
    </>
  );
};

const context = () => {
  if (!currentThemeContext) throw new Error('ThemeProbe ainda não renderizou');
  return currentThemeContext;
};

const renderProvider = (onThemeChange?: (key: NeonColorKey) => void) =>
  render(
    <ThemeProvider onThemeChange={onThemeChange} {...authThemeProps()}>
      <ThemeProbe />
    </ThemeProvider>,
  );

describe('contrato da paleta neon', () => {
  it('oferece exatamente as quatro chaves aprovadas e deriva o azul do mesmo RGB', () => {
    expect(NEON_COLOR_KEYS).toEqual(['yellow', 'blue', 'green', 'red']);
    expect(NEON_COLORS).toEqual({
      yellow: '#EBFF00',
      blue: '#00E5FF',
      green: '#39FF14',
      red: '#FF3131',
    });

    const blue = createTheme('blue');
    expect(blue.colors.accent).toEqual({
      main: '#00E5FF',
      soft: 'rgba(0, 229, 255, 0.075)',
      border: 'rgba(0, 229, 255, 0.45)',
      on: '#0A0A0A',
    });
    expect(blue.colors.border.focus).toBe('rgba(0, 229, 255, 0.45)');
    expect(blue.colors.text.accent).toBe('#00E5FF');
  });

  it.each(NEON_COLOR_KEYS)(
    '%s preserva status e passa contraste WCAG AA',
    (key) => {
      const themed = createTheme(key);
      expect(themed.colors.status).toEqual(defaultTheme.colors.status);
      expect(JSON.stringify(themed.colors.status)).toBe(
        JSON.stringify(defaultTheme.colors.status),
      );
      expect(
        contrastRatio(themed.colors.accent.main, themed.colors.accent.on),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('resolve qualquer fronteira desconhecida para yellow', () => {
    for (const value of [null, undefined, '', 'purple', 42, {}, 'BLUE']) {
      expect(parseNeonColor(value)).toBe('yellow');
      expect(createTheme(value).colors.accent.main).toBe('#EBFF00');
    }
  });

  it('mantém o default export amarelo e profundamente congelado', () => {
    expect(defaultTheme.colors.accent.main).toBe('#EBFF00');
    expect(Object.isFrozen(defaultTheme)).toBe(true);
    expect(Object.isFrozen(defaultTheme.colors)).toBe(true);
    expect(Object.isFrozen(defaultTheme.colors.accent)).toBe(true);
    (defaultTheme.colors.accent as { main: string }).main = '#FFFFFF';
    expect(defaultTheme.colors.accent.main).toBe('#EBFF00');
  });
});

describe('neonPreferenceRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSingle.mockResolvedValue({
      data: { id: 'user-a', neon_color: 'blue' },
      error: null,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('atualiza somente profiles.neon_color para o id autenticado', async () => {
    await expect(
      neonPreferenceRepository.saveNeonColor('user-a', 'blue'),
    ).resolves.toEqual({ id: 'user-a', neon_color: 'blue' });

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockUpdate).toHaveBeenCalledWith({ neon_color: 'blue' });
    expect(mockEq).toHaveBeenCalledWith('id', 'user-a');
    expect(mockSelect).toHaveBeenCalledWith('id, neon_color');
    expect(mockSingle).toHaveBeenCalledTimes(1);
  });

  it('propaga o erro retornado pelo Supabase', async () => {
    const databaseError = { code: '42501', message: 'RLS recusou' };
    mockSingle.mockResolvedValueOnce({ data: null, error: databaseError });

    await expect(
      neonPreferenceRepository.saveNeonColor('user-a', 'red'),
    ).rejects.toBe(databaseError);
  });

  it('falha fechado quando o update não retorna a linha', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      neonPreferenceRepository.saveNeonColor('user-a', 'green'),
    ).rejects.toThrow('A preferência neon atualizada não foi retornada.');
  });
});

describe('ThemeProvider por conta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentThemeContext = null;
    mockAuthState = { user: null, profile: null };
    mockRequireAuthBoundary = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aplica preview azul antes da escrita resolver e depois o confirma', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    const pending = deferred<{ id: string; neon_color: unknown }>();
    jest
      .spyOn(neonPreferenceRepository, 'saveNeonColor')
      .mockReturnValueOnce(pending.promise);
    const onThemeChange = jest.fn();
    const screen = renderProvider(onThemeChange);
    onThemeChange.mockClear();

    let selection!: Promise<void>;
    act(() => {
      selection = context().selectNeonColor('blue');
    });

    expect(screen.getByTestId('neon-color').props.children).toBe('blue');
    expect(screen.getByTestId('theme-main').props.children).toBe('#00E5FF');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('yellow');
    expect(screen.getByTestId('save-status').props.children).toBe('saving');
    expect(onThemeChange).toHaveBeenLastCalledWith('blue');

    // Um rerender do AuthContext com outro objeto de profile, mas a mesma
    // identidade/versão persistida, não pode cancelar o preview em voo.
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    screen.rerender(
      <ThemeProvider onThemeChange={onThemeChange} {...authThemeProps()}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('neon-color').props.children).toBe('blue');
    expect(screen.getByTestId('save-status').props.children).toBe('saving');

    await act(async () => {
      pending.resolve({ id: 'user-a', neon_color: 'blue' });
      await selection;
    });

    expect(screen.getByTestId('confirmed-color').props.children).toBe('blue');
    expect(screen.getByTestId('save-status').props.children).toBe('success');
    expect(neonPreferenceRepository.saveNeonColor).toHaveBeenCalledWith(
      'user-a',
      'blue',
    );
  });

  it('cai para yellow no render de A para B e só hidrata o profile de B', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'red' },
    };
    const screen = renderProvider();
    expect(screen.getByTestId('neon-color').props.children).toBe('red');

    mockAuthState = {
      user: { id: 'user-b' },
      profile: { id: 'user-a', neon_color: 'red' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('neon-color').props.children).toBe('yellow');
    expect(screen.getByTestId('save-status').props.children).toBe('idle');

    mockAuthState = {
      user: { id: 'user-b' },
      profile: { id: 'user-b', neon_color: 'green' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('neon-color').props.children).toBe('green'),
    );
  });

  it('não reaproveita a cor confirmada quando o profile deixa de pertencer ao user atual', () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'red' },
    };
    const renderedColors: NeonColorKey[] = [];
    const RenderHistoryProbe = () => {
      const value = useTheme();
      renderedColors.push(value.neonColor);
      return <Text testID="history-color">{value.neonColor}</Text>;
    };
    const screen = render(
      <ThemeProvider {...authThemeProps()}>
        <RenderHistoryProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('history-color').props.children).toBe('red');

    renderedColors.length = 0;
    mockAuthState = { user: { id: 'user-a' }, profile: null };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <RenderHistoryProbe />
      </ThemeProvider>,
    );

    expect(renderedColors[0]).toBe('yellow');
    expect(screen.getByTestId('history-color').props.children).toBe('yellow');
  });

  it('render suspenso e abortado de B não invalida o save da conta A ainda visível', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    const save = deferred<{ id: string; neon_color: unknown }>();
    const suspendedRender = deferred<void>();
    let didSuspend = false;
    jest
      .spyOn(neonPreferenceRepository, 'saveNeonColor')
      .mockReturnValueOnce(save.promise);

    const MaybeSuspend = ({ suspend }: { suspend: boolean }) => {
      if (suspend) {
        didSuspend = true;
        throw suspendedRender.promise;
      }
      return <ThemeProbe />;
    };
    const tree = (suspend: boolean) => (
      <Suspense fallback={<Text testID="suspended-render">suspenso</Text>}>
        <ThemeProvider {...authThemeProps()}>
          <MaybeSuspend suspend={suspend} />
        </ThemeProvider>
      </Suspense>
    );

    const screen = render(tree(false));
    let selection!: Promise<void>;
    act(() => {
      selection = context().selectNeonColor('blue');
    });
    expect(screen.getByTestId('neon-color').props.children).toBe('blue');

    // B chega a renderizar, mas a suspensão impede o commit dessa identidade.
    mockAuthState = {
      user: { id: 'user-b' },
      profile: { id: 'user-b', neon_color: 'green' },
    };
    screen.rerender(tree(true));
    expect(didSuspend).toBe(true);

    await act(async () => {
      save.resolve({ id: 'user-a', neon_color: 'blue' });
      await selection;
    });

    // O render de B é abandonado e A volta sem que seu save tenha sido
    // invalidado por mutações feitas numa renderização que nunca commitou.
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    screen.rerender(tree(false));
    expect(screen.getByTestId('neon-color').props.children).toBe('blue');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('blue');
    expect(screen.getByTestId('save-status').props.children).toBe('success');
  });

  it.each(['resolve', 'reject'] as const)(
    'descarta por inteiro uma resposta de A que %s depois da troca para B',
    async (outcome) => {
      mockAuthState = {
        user: { id: 'user-a' },
        profile: { id: 'user-a', neon_color: 'red' },
      };
      const pending = deferred<{ id: string; neon_color: unknown }>();
      jest
        .spyOn(neonPreferenceRepository, 'saveNeonColor')
        .mockReturnValueOnce(pending.promise);
      const onThemeChange = jest.fn();
      const screen = renderProvider(onThemeChange);
      let selection!: Promise<void>;
      act(() => {
        selection = context().selectNeonColor('blue');
      });

      mockAuthState = {
        user: { id: 'user-b' },
        profile: { id: 'user-a', neon_color: 'red' },
      };
      screen.rerender(
        <ThemeProvider onThemeChange={onThemeChange} {...authThemeProps()}>
          <ThemeProbe />
        </ThemeProvider>,
      );
      expect(screen.getByTestId('neon-color').props.children).toBe('yellow');
      expect(screen.getByTestId('save-status').props.children).toBe('idle');
      onThemeChange.mockClear();

      await act(async () => {
        if (outcome === 'resolve') {
          pending.resolve({ id: 'user-a', neon_color: 'blue' });
        } else {
          pending.reject(new Error('falha atrasada de A'));
        }
        await selection;
      });

      expect(screen.getByTestId('neon-color').props.children).toBe('yellow');
      expect(screen.getByTestId('save-status').props.children).toBe('idle');
      expect(screen.getByTestId('save-message').props.children).toBe(
        'sem-mensagem',
      );
      expect(onThemeChange).not.toHaveBeenCalled();
    },
  );

  it('profile sumir e voltar não abre segundo write para o mesmo owner nem diverge', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    const oldSave = deferred<{ id: string; neon_color: unknown }>();
    const save = jest
      .spyOn(neonPreferenceRepository, 'saveNeonColor')
      .mockReturnValueOnce(oldSave.promise);
    const screen = renderProvider();

    let oldSelection!: Promise<void>;
    act(() => {
      oldSelection = context().selectNeonColor('blue');
    });

    mockAuthState = { user: { id: 'user-a' }, profile: null };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    let currentSelection!: Promise<void>;
    act(() => {
      currentSelection = context().selectNeonColor('blue');
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      oldSave.resolve({ id: 'user-a', neon_color: 'blue' });
      await oldSelection;
    });
    await currentSelection;
    expect(screen.getByTestId('neon-color').props.children).toBe('blue');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('blue');
    expect(screen.getByTestId('save-status').props.children).toBe('success');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('save concluir enquanto profile está ausente também converge ao voltar', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    const pending = deferred<{ id: string; neon_color: unknown }>();
    const save = jest
      .spyOn(neonPreferenceRepository, 'saveNeonColor')
      .mockReturnValueOnce(pending.promise);
    const screen = renderProvider();

    let selection!: Promise<void>;
    act(() => {
      selection = context().selectNeonColor('blue');
    });

    mockAuthState = { user: { id: 'user-a' }, profile: null };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('neon-color').props.children).toBe('yellow');

    await act(async () => {
      pending.resolve({ id: 'user-a', neon_color: 'blue' });
      await selection;
    });

    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('neon-color').props.children).toBe('blue');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('blue');
    expect(screen.getByTestId('save-status').props.children).toBe('success');
  });

  it('A volta antes do save resolver e serializa a última intenção sem overlap', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    const blueSave = deferred<{ id: string; neon_color: unknown }>();
    const greenSave = deferred<{ id: string; neon_color: unknown }>();
    let activeWrites = 0;
    let maxActiveWrites = 0;
    const save = jest
      .spyOn(neonPreferenceRepository, 'saveNeonColor')
      .mockImplementation((_ownerId, color) => {
        activeWrites += 1;
        maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
        const pending = color === 'blue' ? blueSave.promise : greenSave.promise;
        return pending.finally(() => {
          activeWrites -= 1;
        });
      });
    const screen = renderProvider();

    let blueSelection!: Promise<void>;
    act(() => {
      blueSelection = context().selectNeonColor('blue');
    });
    expect(save).toHaveBeenCalledTimes(1);

    mockAuthState = {
      user: { id: 'user-b' },
      profile: { id: 'user-b', neon_color: 'red' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('neon-color').props.children).toBe('red');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('red');

    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('neon-color').props.children).toBe('blue');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('yellow');
    expect(screen.getByTestId('save-status').props.children).toBe('saving');

    let greenSelection!: Promise<void>;
    act(() => {
      greenSelection = context().selectNeonColor('green');
    });
    expect(screen.getByTestId('neon-color').props.children).toBe('green');
    expect(screen.getByTestId('save-status').props.children).toBe('saving');
    expect(save).toHaveBeenCalledTimes(1);
    expect(maxActiveWrites).toBe(1);

    await act(async () => {
      blueSave.resolve({ id: 'user-a', neon_color: 'blue' });
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenNthCalledWith(2, 'user-a', 'green');
    expect(screen.getByTestId('neon-color').props.children).toBe('green');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('blue');
    expect(screen.getByTestId('save-status').props.children).toBe('saving');
    expect(maxActiveWrites).toBe(1);

    await act(async () => {
      greenSave.resolve({ id: 'user-a', neon_color: 'green' });
      await blueSelection;
      await greenSelection;
    });
    expect(screen.getByTestId('neon-color').props.children).toBe('green');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('green');
    expect(screen.getByTestId('save-status').props.children).toBe('success');
    expect(maxActiveWrites).toBe(1);
  });

  it('owners diferentes podem manter writes independentes sem resposta de A tocar B', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    const saveA = deferred<{ id: string; neon_color: unknown }>();
    const saveB = deferred<{ id: string; neon_color: unknown }>();
    const save = jest
      .spyOn(neonPreferenceRepository, 'saveNeonColor')
      .mockReturnValueOnce(saveA.promise)
      .mockReturnValueOnce(saveB.promise);
    const screen = renderProvider();

    let selectionA!: Promise<void>;
    act(() => {
      selectionA = context().selectNeonColor('blue');
    });

    mockAuthState = {
      user: { id: 'user-b' },
      profile: { id: 'user-b', neon_color: 'yellow' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    let selectionB!: Promise<void>;
    act(() => {
      selectionB = context().selectNeonColor('green');
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(1, 'user-a', 'blue');
    expect(save).toHaveBeenNthCalledWith(2, 'user-b', 'green');

    await act(async () => {
      saveB.resolve({ id: 'user-b', neon_color: 'green' });
      await selectionB;
    });
    expect(screen.getByTestId('confirmed-color').props.children).toBe('green');

    await act(async () => {
      saveA.resolve({ id: 'user-a', neon_color: 'blue' });
      await selectionA;
    });
    expect(screen.getByTestId('neon-color').props.children).toBe('green');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('green');
    expect(screen.getByTestId('save-status').props.children).toBe('success');
  });

  it('reverte no erro e confirma a tentativa no retry', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    const first = deferred<{ id: string; neon_color: unknown }>();
    const second = deferred<{ id: string; neon_color: unknown }>();
    const save = jest
      .spyOn(neonPreferenceRepository, 'saveNeonColor')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onThemeChange = jest.fn();
    const screen = renderProvider(onThemeChange);
    onThemeChange.mockClear();

    let firstSelection!: Promise<void>;
    act(() => {
      firstSelection = context().selectNeonColor('blue');
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('neon-color').props.children).toBe('blue');

    await act(async () => {
      first.reject(new Error('rede indisponível'));
      await firstSelection;
    });
    expect(screen.getByTestId('neon-color').props.children).toBe('yellow');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('yellow');
    expect(screen.getByTestId('save-status').props.children).toBe('error');
    expect(screen.getByTestId('save-message').props.children).not.toBe(
      'sem-mensagem',
    );
    expect(onThemeChange.mock.calls.map(([key]) => key)).toEqual([
      'blue',
      'yellow',
    ]);

    let retry!: Promise<void>;
    act(() => {
      retry = context().retryNeonColor();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('user-a', 'blue');

    await act(async () => {
      second.resolve({ id: 'user-a', neon_color: 'blue' });
      await retry;
    });
    expect(screen.getByTestId('confirmed-color').props.children).toBe('blue');
    expect(screen.getByTestId('save-status').props.children).toBe('success');
    expect(screen.getByTestId('save-message').props.children).toBe(
      'Cor salva com sucesso.',
    );
  });

  it('normaliza payload desconhecido do repository para yellow', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'green' },
    };
    jest
      .spyOn(neonPreferenceRepository, 'saveNeonColor')
      .mockResolvedValueOnce({ id: 'user-a', neon_color: 'purple' });
    const screen = renderProvider();

    await act(async () => {
      await context().selectNeonColor('red');
    });

    expect(screen.getByTestId('neon-color').props.children).toBe('yellow');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('yellow');
    expect(screen.getByTestId('save-status').props.children).toBe('success');
  });

  it('reverte quando o repository devolve uma linha de outra conta', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    jest
      .spyOn(neonPreferenceRepository, 'saveNeonColor')
      .mockResolvedValueOnce({ id: 'user-b', neon_color: 'blue' });
    const screen = renderProvider();

    await act(async () => {
      await context().selectNeonColor('blue');
    });

    expect(screen.getByTestId('neon-color').props.children).toBe('yellow');
    expect(screen.getByTestId('confirmed-color').props.children).toBe('yellow');
    expect(screen.getByTestId('save-status').props.children).toBe('error');
  });

  it('retry sem tentativa anterior não escreve', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    const save = jest.spyOn(neonPreferenceRepository, 'saveNeonColor');
    renderProvider();

    await act(async () => {
      await context().retryNeonColor();
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('memoiza useThemeStyles pelo objeto de tema, não por mudanças de status', async () => {
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
    const pending = deferred<{ id: string; neon_color: unknown }>();
    jest
      .spyOn(neonPreferenceRepository, 'saveNeonColor')
      .mockReturnValueOnce(pending.promise);
    const factory = jest.fn((theme: typeof defaultTheme) => ({
      color: theme.colors.accent.main,
    }));

    const StyleProbe = () => {
      const styles = useThemeStyles(factory);
      const value = useTheme();
      currentThemeContext = value;
      return <Text testID="style-color">{styles.color}</Text>;
    };
    const screen = render(
      <ThemeProvider {...authThemeProps()}>
        <StyleProbe />
      </ThemeProvider>,
    );
    expect(factory).toHaveBeenCalledTimes(1);

    let selection!: Promise<void>;
    act(() => {
      selection = context().selectNeonColor('blue');
    });
    expect(screen.getByTestId('style-color').props.children).toBe('#00E5FF');
    expect(factory).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.resolve({ id: 'user-a', neon_color: 'blue' });
      await selection;
    });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('hooks de tema', () => {
  // Mudança de contrato (era: "useTheme recusa uso fora do provider" —
  // lançava). Tema é apresentação: um componente compartilhado precisa
  // renderizar sozinho mesmo sem <ThemeProvider> na árvore (ex.: suítes
  // legadas que nunca envolveram seus componentes nele). useTheme() agora
  // degrada graciosamente para o tema neon padrão canônico
  // (createTheme('yellow'), o mesmo singleton de src/theme/theme.ts) em vez
  // de lançar. Cobertura complementar, com consumidores reais (Logo,
  // Feedback), em __tests__/themeFallbackWithoutProvider.test.tsx.
  it('useTheme fora do provider não lança e devolve o tema neon padrão', () => {
    let captured: ReturnType<typeof useTheme> | undefined;
    const OutsideProvider = () => {
      captured = useTheme();
      return null;
    };

    expect(() => render(<OutsideProvider />)).not.toThrow();

    expect(captured?.neonColor).toBe('yellow');
    expect(captured?.confirmedNeonColor).toBe('yellow');
    expect(captured?.status).toBe('idle');
    expect(captured?.message).toBeNull();
    expect(captured?.theme).toEqual(defaultTheme);
  });

  it('selectNeonColor/retryNeonColor fora do provider são no-ops resolvidos, sem lançar', async () => {
    let captured: ReturnType<typeof useTheme> | undefined;
    const OutsideProvider = () => {
      captured = useTheme();
      return null;
    };
    render(<OutsideProvider />);

    await expect(captured!.selectNeonColor('blue')).resolves.toBeUndefined();
    await expect(captured!.retryNeonColor()).resolves.toBeUndefined();
  });
});

describe('integração da árvore raiz', () => {
  beforeEach(() => {
    mockRootMounts = 0;
    mockRequireAuthBoundary = true;
    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'yellow' },
    };
  });

  afterEach(() => {
    mockRequireAuthBoundary = false;
  });

  it('monta AuthProvider > ThemeProvider e troca tema sem remontar a árvore', async () => {
    const screen = render(<App />);

    expect(screen.getByTestId('root-theme').props.children).toBe('yellow');
    expect(mockRootMounts).toBe(1);

    mockAuthState = {
      user: { id: 'user-a' },
      profile: { id: 'user-a', neon_color: 'blue' },
    };
    screen.rerender(<App />);

    await waitFor(() =>
      expect(screen.getByTestId('root-theme').props.children).toBe('blue'),
    );
    expect(mockRootMounts).toBe(1);
  });
});
