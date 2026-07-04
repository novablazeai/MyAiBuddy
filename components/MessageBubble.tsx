"use client";

import { type CSSProperties } from "react";
import type { Message } from "@/lib/types";
import type { Persona } from "@/lib/personas";
import { useMessagePlayer } from "@/hooks/useAudioPlayer";
import { seekPlayback, stopPlayback, togglePlayback } from "@/lib/speech";
import PersonaAvatar from "./PersonaAvatar";

interface MessageBubbleProps {
  message: Message;
  persona: Persona;
  onReplay?: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MessageBubble({
  message,
  persona,
  onReplay,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const player = useMessagePlayer(message.id);
  const isActive = player.messageId === message.id;
  const isLoading = isActive && player.status === "loading";
  const isPlaying = isActive && player.status === "playing";
  const isPaused = isActive && player.status === "paused";
  const showPlayer = isActive && (isPlaying || isPaused) && player.duration > 0;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-sm"
          style={{
            backgroundColor:
              persona.accentColor === "blue"
                ? "rgba(37, 99, 235, 0.15)"
                : "rgba(219, 39, 119, 0.15)",
          }}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  const accent = persona.accentHex;

  return (
    <div className="flex items-end gap-2.5">
      <PersonaAvatar persona={persona} size="sm" />
      <div className="flex max-w-[80%] flex-col gap-1.5">
        <div
          className={`rounded-2xl rounded-bl-md border px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-sm backdrop-blur-xl ${
            isPlaying || isPaused
              ? "border-white bg-white/95 ring-2"
              : "border-white/60 bg-white/75"
          }`}
          style={
            isPlaying || isPaused
              ? ({ ringColor: `${accent}55` } as CSSProperties)
              : undefined
          }
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        {onReplay && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isPlaying || isPaused) togglePlayback();
                else onReplay();
              }}
              disabled={isLoading}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/90 shadow-sm transition hover:bg-white disabled:opacity-60"
              style={{ color: accent }}
              title={
                isLoading
                  ? "Loading…"
                  : isPlaying
                    ? "Pause"
                    : isPaused
                      ? "Resume"
                      : "Play message audio"
              }
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isLoading ? (
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden
                />
              ) : isPlaying ? (
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {showPlayer ? (
              <>
                <input
                  type="range"
                  min={0}
                  max={player.duration}
                  step={0.1}
                  value={player.position}
                  onChange={(e) => seekPlayback(Number(e.target.value))}
                  className="h-1 w-32 cursor-pointer appearance-none rounded-full bg-slate-200 accent-current sm:w-40"
                  style={{ accentColor: accent }}
                  aria-label="Seek"
                />
                <span className="tabular-nums text-[11px] text-slate-500">
                  {formatTime(player.position)} / {formatTime(player.duration)}
                </span>
                <button
                  type="button"
                  onClick={() => stopPlayback()}
                  className="rounded-full p-1 text-slate-400 transition hover:text-slate-700"
                  title="Stop"
                  aria-label="Stop"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h12v12H6z" />
                  </svg>
                </button>
              </>
            ) : (
              <span className="text-xs font-medium" style={{ color: accent }}>
                {isLoading ? "Loading…" : "Replay"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
