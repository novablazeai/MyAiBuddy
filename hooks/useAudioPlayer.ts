"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getPlayerState,
  getPlayerStatus,
  subscribePlayer,
  type PlayerState,
} from "@/lib/speech";

const INACTIVE: PlayerState = {
  messageId: null,
  status: "idle",
  position: 0,
  duration: 0,
  error: null,
};

/**
 * Player status without the live playhead — re-renders only when the active
 * message, status, duration, or error changes (not on every position tick).
 */
export function useAudioPlayerStatus(): PlayerState {
  return useSyncExternalStore(subscribePlayer, getPlayerStatus, () => INACTIVE);
}

/**
 * Full player state for a specific message. Returns a stable INACTIVE snapshot
 * when this message isn't the one playing, so only the active message's UI
 * re-renders as the playhead moves.
 */
export function useMessagePlayer(messageId: string): PlayerState {
  const getSnapshot = useCallback(() => {
    const state = getPlayerState();
    return state.messageId === messageId ? state : INACTIVE;
  }, [messageId]);

  return useSyncExternalStore(subscribePlayer, getSnapshot, () => INACTIVE);
}
