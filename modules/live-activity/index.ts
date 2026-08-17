import { NativeModule, requireNativeModule } from 'expo';

import type { LiveActivityContentState } from '../../src/engine/liveActivityContentState';

export type { LiveActivityContentState } from '../../src/engine/liveActivityContentState';

type LiveActivityModuleEvents = {};

declare class LiveActivityModuleType extends NativeModule<LiveActivityModuleEvents> {
  startActivity(state: LiveActivityContentState, sessionLogId: string): Promise<boolean>;
  updateActivity(state: LiveActivityContentState): Promise<boolean>;
  endActivity(
    dismissalPolicy: 'immediate' | 'afterDate',
    afterSeconds?: number,
  ): Promise<boolean>;
  isActivityRunning(): Promise<boolean>;
  reconcileOrphans(stillActiveSessionLogId: string | null): Promise<boolean>;
}

const LiveActivityModule = requireNativeModule<LiveActivityModuleType>('LiveActivityModule');

export const startLiveActivity = (
  state: LiveActivityContentState,
  sessionLogId: string,
): Promise<boolean> => LiveActivityModule.startActivity(state, sessionLogId);

export const updateLiveActivity = (
  state: LiveActivityContentState,
): Promise<boolean> => LiveActivityModule.updateActivity(state);

export const endLiveActivity = (
  dismissalPolicy: 'immediate' | 'afterDate',
  afterSeconds?: number,
): Promise<boolean> => LiveActivityModule.endActivity(dismissalPolicy, afterSeconds);

export const isLiveActivityRunning = (): Promise<boolean> =>
  LiveActivityModule.isActivityRunning();

export const reconcileLiveActivityOrphans = (
  stillActiveSessionLogId: string | null,
): Promise<boolean> => LiveActivityModule.reconcileOrphans(stillActiveSessionLogId);
