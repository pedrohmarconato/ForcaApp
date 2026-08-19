import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '../contexts/AuthContext';
import { neonPreferenceRepository } from '../services/neonPreferenceRepository';
import {
  createTheme,
  parseNeonColor,
  type NeonColorKey,
  type Theme,
} from './theme';

export type ThemeSaveStatus = 'idle' | 'saving' | 'success' | 'error';

export type ThemeContextValue = {
  theme: Theme;
  neonColor: NeonColorKey;
  confirmedNeonColor: NeonColorKey;
  status: ThemeSaveStatus;
  message: string | null;
  selectNeonColor: (key: NeonColorKey) => Promise<void>;
  retryNeonColor: () => Promise<void>;
};

type ThemeProviderProps = {
  children: ReactNode;
  onThemeChange?: (key: NeonColorKey) => void;
};

type ThemeState = {
  ownerId: string | null;
  confirmed: NeonColorKey;
  preview: NeonColorKey;
  status: ThemeSaveStatus;
  message: string | null;
  attempted: NeonColorKey | null;
};

type SaveToken = {
  ownerId: string;
  requested: NeonColorKey;
  rollback: NeonColorKey;
  queued: NeonColorKey | null;
  completion: Promise<void>;
};

type CommittedIdentity = {
  ownerId: string | null;
  profileId: string | null;
  profileMatchesUser: boolean;
  profileColor: NeonColorKey;
  signature: string;
};

const successMessage = 'Cor salva com sucesso.';
const errorMessage = 'Não foi possível salvar a cor. Tente novamente.';

const stateForProfile = (
  userId: string | null,
  profile: { id?: unknown; neon_color?: unknown } | null | undefined,
): ThemeState => {
  const ownsProfile = Boolean(userId && profile?.id === userId);
  const color = ownsProfile ? parseNeonColor(profile?.neon_color) : 'yellow';
  return {
    ownerId: userId,
    confirmed: color,
    preview: color,
    status: 'idle',
    message: null,
    attempted: null,
  };
};

const stateForPendingSave = (token: SaveToken): ThemeState => {
  const requested = token.queued ?? token.requested;
  return {
    ownerId: token.ownerId,
    confirmed: token.rollback,
    preview: requested,
    status: 'saving',
    message: null,
    attempted: requested,
  };
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider = ({
  children,
  onThemeChange,
}: ThemeProviderProps) => {
  const { user, profile } = useAuth();
  const userId = typeof user?.id === 'string' ? user.id : null;
  const profileId = typeof profile?.id === 'string' ? profile.id : null;
  const profileColor = profile?.neon_color;
  const profileMatchesUser = Boolean(userId && profileId === userId);
  const normalizedProfileColor = profileMatchesUser
    ? parseNeonColor(profileColor)
    : 'yellow';
  const identitySignature = JSON.stringify([
    userId,
    profileMatchesUser,
    normalizedProfileColor,
  ]);

  const [state, setState] = useState<ThemeState>(() =>
    stateForProfile(userId, profile),
  );
  const committedStateRef = useRef(state);
  const committedIdentityRef = useRef<CommittedIdentity>({
    ownerId: userId,
    profileId,
    profileMatchesUser,
    profileColor: normalizedProfileColor,
    signature: identitySignature,
  });
  const inFlightByOwnerRef = useRef(new Map<string, SaveToken>());

  // Identidade e snapshot de estado só entram nas refs após commit. Um render
  // concorrente que suspende/é abortado não consegue invalidar a Promise da
  // árvore que continua visível. O fallback de mismatch não depende destas
  // refs: ele é calculado abaixo diretamente de user/profile no próprio render.
  useLayoutEffect(() => {
    const previous = committedIdentityRef.current;
    const ownerChanged = previous.ownerId !== userId;
    const identityChanged = previous.signature !== identitySignature;
    committedIdentityRef.current = {
      ownerId: userId,
      profileId,
      profileMatchesUser,
      profileColor: normalizedProfileColor,
      signature: identitySignature,
    };

    if (!identityChanged) return;

    const pendingForOwner = userId
      ? inFlightByOwnerRef.current.get(userId)
      : undefined;
    if (pendingForOwner && profileMatchesUser) {
      setState(stateForPendingSave(pendingForOwner));
      return;
    }

    const committedState = committedStateRef.current;
    const sameOwnerHasLocalOutcome = Boolean(
      userId &&
      committedState.ownerId === userId &&
      committedState.status !== 'idle',
    );
    if (ownerChanged || (!pendingForOwner && !sameOwnerHasLocalOutcome)) {
      setState(
        stateForProfile(userId, {
          id: profileId,
          neon_color: normalizedProfileColor,
        }),
      );
    }
  }, [identitySignature]);

  useLayoutEffect(() => {
    committedStateRef.current = state;
  }, [state]);

  const ownsState = Boolean(
    profileMatchesUser && userId && state.ownerId === userId,
  );
  const pendingForRenderedOwner =
    profileMatchesUser && userId
      ? inFlightByOwnerRef.current.get(userId)
      : undefined;
  const pendingState = pendingForRenderedOwner
    ? stateForPendingSave(pendingForRenderedOwner)
    : null;
  const neonColor = pendingState
    ? pendingState.preview
    : ownsState
      ? state.preview
      : 'yellow';
  const confirmedNeonColor = pendingState
    ? pendingState.confirmed
    : ownsState
      ? state.confirmed
      : 'yellow';
  const status = pendingState ? 'saving' : ownsState ? state.status : 'idle';
  const message = pendingState ? null : ownsState ? state.message : null;
  const theme = useMemo(() => createTheme(neonColor), [neonColor]);

  const runSaveToken = useCallback(async (token: SaveToken) => {
    while (inFlightByOwnerRef.current.get(token.ownerId) === token) {
      const requested = token.requested;
      const rollback = token.rollback;
      let confirmed = rollback;
      let succeeded = false;

      try {
        const saved = await neonPreferenceRepository.saveNeonColor(
          token.ownerId,
          requested,
        );
        if (saved.id !== token.ownerId) {
          throw new Error('A preferência retornada pertence a outra conta.');
        }
        confirmed = parseNeonColor(saved.neon_color);
        succeeded = true;
      } catch (_error) {
        confirmed = rollback;
      }

      const queued = token.queued;
      token.queued = null;

      if (queued) {
        token.requested = queued;
        token.rollback = confirmed;
        setState((latest) =>
          latest.ownerId === token.ownerId
            ? {
                ...latest,
                confirmed,
                preview: queued,
                status: 'saving',
                message: null,
                attempted: queued,
              }
            : latest,
        );
        continue;
      }

      if (inFlightByOwnerRef.current.get(token.ownerId) === token) {
        inFlightByOwnerRef.current.delete(token.ownerId);
      }
      setState((latest) =>
        latest.ownerId === token.ownerId
          ? {
              ...latest,
              confirmed,
              preview: confirmed,
              status: succeeded ? 'success' : 'error',
              message: succeeded ? successMessage : errorMessage,
              attempted: succeeded ? null : requested,
            }
          : latest,
      );
      return;
    }
  }, []);

  const persistNeonColor = useCallback(
    async (requestedKey: NeonColorKey) => {
      const identity = committedIdentityRef.current;
      const ownerId = identity.ownerId;
      const current = committedStateRef.current;
      const requested = parseNeonColor(requestedKey);

      if (
        !ownerId ||
        !identity.profileMatchesUser ||
        identity.profileId !== ownerId ||
        current.ownerId !== ownerId
      ) {
        return;
      }

      const activeToken = inFlightByOwnerRef.current.get(ownerId);
      if (activeToken) {
        if (requested !== activeToken.requested || activeToken.queued) {
          activeToken.queued = requested;
          setState((latest) =>
            latest.ownerId === ownerId
              ? {
                  ...latest,
                  preview: requested,
                  status: 'saving',
                  message: null,
                  attempted: requested,
                }
              : latest,
          );
        }
        return activeToken.completion;
      }

      const token: SaveToken = {
        ownerId,
        requested,
        rollback: current.confirmed,
        queued: null,
        completion: Promise.resolve(),
      };
      inFlightByOwnerRef.current.set(ownerId, token);
      setState({
        ...current,
        preview: requested,
        status: 'saving',
        message: null,
        attempted: requested,
      });
      token.completion = runSaveToken(token);
      return token.completion;
    },
    [runSaveToken],
  );

  const selectNeonColor = useCallback(
    (key: NeonColorKey) => persistNeonColor(key),
    [persistNeonColor],
  );

  const retryNeonColor = useCallback(() => {
    const identity = committedIdentityRef.current;
    const latest = committedStateRef.current;
    if (
      !latest.attempted ||
      !identity.ownerId ||
      latest.ownerId !== identity.ownerId
    ) {
      return Promise.resolve();
    }
    return persistNeonColor(latest.attempted);
  }, [persistNeonColor]);

  const lastPublishedRef = useRef<NeonColorKey | null>(null);
  useEffect(() => {
    if (lastPublishedRef.current === neonColor) return;
    lastPublishedRef.current = neonColor;
    onThemeChange?.(neonColor);
  }, [neonColor, onThemeChange]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      neonColor,
      confirmedNeonColor,
      status,
      message,
      selectNeonColor,
      retryNeonColor,
    }),
    [
      confirmedNeonColor,
      message,
      neonColor,
      retryNeonColor,
      selectNeonColor,
      status,
      theme,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de um ThemeProvider');
  }
  return context;
};

export const useThemeStyles = <T,>(factory: (theme: Theme) => T): T => {
  const { theme } = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
};
