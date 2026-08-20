import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import type { CardioLog } from '../src/engine/cardioGoals';

let mockAuthState: {
  user: { id: string };
  profile: { id: string; neon_color: 'yellow' | 'blue' };
} = {
  user: { id: 'user-1' },
  profile: { id: 'user-1', neon_color: 'yellow' },
};
let mockLineChartMounts = 0;
let mockLineChartUnmounts = 0;
let mockLineChartRenders: any[] = [];

const mockGetCardioLogs = jest.fn<Promise<CardioLog[]>, [string]>();

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

// ThemeProvider não chama mais useAuth() internamente (fix da coesão
// tema/auth) — quem instancia <ThemeProvider> direto precisa repassar
// userId/profile por prop, lidos do mesmo mockAuthState.
const authThemeProps = () => ({
  userId: mockAuthState.user?.id ?? null,
  profile: mockAuthState.profile,
});

jest.mock('../src/services/cardioGoalRepository', () => ({
  getCardioLogs: (userId: string) => mockGetCardioLogs(userId),
}));

jest.mock('../src/services/neonPreferenceRepository', () => ({
  neonPreferenceRepository: { saveNeonColor: jest.fn() },
}));

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

jest.mock('react-native-chart-kit', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    LineChart: (props: any) => {
      mockLineChartRenders.push(props);
      React.useEffect(() => {
        mockLineChartMounts += 1;
        return () => {
          mockLineChartUnmounts += 1;
        };
      }, []);
      return React.createElement(View, { testID: 'line-chart-mock' });
    },
  };
});

import CardioEvolucaoChart from '../src/components/progress/CardioEvolucaoChart';
import { ThemeProvider } from '../src/theme/ThemeProvider';

const logs: CardioLog[] = [
  {
    identity: 'k:corrida',
    name: 'Corrida',
    durationSeconds: 1500,
    distanceM: 5000,
    completedAt: '2026-08-01T09:00:00Z',
  },
  {
    identity: 'k:corrida',
    name: 'Corrida',
    durationSeconds: 1450,
    distanceM: 5000,
    completedAt: '2026-08-08T09:00:00Z',
  },
  {
    identity: 'k:corrida',
    name: 'Corrida',
    durationSeconds: 1400,
    distanceM: 5000,
    completedAt: '2026-08-15T09:00:00Z',
  },
  {
    identity: 'k:bike',
    name: 'Bicicleta',
    durationSeconds: 1200,
    distanceM: 4000,
    completedAt: '2026-08-03T09:00:00Z',
  },
  {
    identity: 'k:bike',
    name: 'Bicicleta',
    durationSeconds: 2400,
    distanceM: 6000,
    completedAt: '2026-08-10T09:00:00Z',
  },
];

const tree = () => (
  <ThemeProvider {...authThemeProps()}>
    <CardioEvolucaoChart />
  </ThemeProvider>
);

const latestChartProps = () =>
  mockLineChartRenders[mockLineChartRenders.length - 1];

describe('CardioEvolucaoChart com tema configurável', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      user: { id: 'user-1' },
      profile: { id: 'user-1', neon_color: 'yellow' },
    };
    mockLineChartMounts = 0;
    mockLineChartUnmounts = 0;
    mockLineChartRenders = [];
    mockGetCardioLogs.mockResolvedValue(logs);
  });

  it('troca chartConfig de yellow para blue sem remount nem perda de dados e interações', async () => {
    const screen = render(tree());

    await waitFor(() =>
      expect(screen.getByTestId('line-chart-mock')).toBeTruthy(),
    );
    expect(mockGetCardioLogs).toHaveBeenCalledWith('user-1');
    const initialChartConfig = latestChartProps().chartConfig;

    fireEvent.press(screen.getByText('Bicicleta'));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Gráfico de evolução de pace em Bicicleta'),
      ).toBeTruthy(),
    );
    fireEvent.press(screen.getByText('Km'));
    await waitFor(() =>
      expect(
        screen.getByLabelText(
          'Gráfico de evolução de quilômetros em Bicicleta',
        ),
      ).toBeTruthy(),
    );

    const yellowProps = latestChartProps();
    expect(yellowProps.chartConfig).toBe(initialChartConfig);
    expect(yellowProps.chartConfig.color()).toBe('rgba(235, 255, 0, 1)');
    expect(yellowProps.chartConfig.color(0.4)).toBe('rgba(235, 255, 0, 0.4)');
    expect(yellowProps.chartConfig.propsForDots.stroke).toBe('#EBFF00');
    expect(yellowProps.data.datasets[0].data).toEqual([4, 6]);
    expect(yellowProps.formatYLabel('4.5')).toBe('4,5');
    expect(mockLineChartMounts).toBe(1);
    expect(mockLineChartUnmounts).toBe(0);

    mockAuthState = {
      user: { id: 'user-1' },
      profile: { id: 'user-1', neon_color: 'blue' },
    };
    act(() => {
      screen.rerender(tree());
    });

    await waitFor(() =>
      expect(latestChartProps().chartConfig.propsForDots.stroke).toBe(
        '#00E5FF',
      ),
    );

    const blueProps = latestChartProps();
    expect(blueProps.chartConfig).not.toBe(yellowProps.chartConfig);
    expect(blueProps.chartConfig.color()).toBe('rgba(0, 229, 255, 1)');
    expect(blueProps.chartConfig.color(0.4)).toBe('rgba(0, 229, 255, 0.4)');
    expect(blueProps.data).toEqual(yellowProps.data);
    expect(blueProps.width).toBe(yellowProps.width);
    expect(blueProps.height).toBe(yellowProps.height);
    expect(blueProps.formatYLabel('4.5')).toBe(yellowProps.formatYLabel('4.5'));
    expect(
      screen.getByLabelText('Gráfico de evolução de quilômetros em Bicicleta'),
    ).toBeTruthy();
    expect(mockLineChartMounts).toBe(1);
    expect(mockLineChartUnmounts).toBe(0);
  });
});
