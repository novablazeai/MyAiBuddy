"use client";

import { type CSSProperties } from "react";
import type { Message } from "@/lib/types";
import type { Persona } from "@/lib/personas";
import PersonaAvatar from "./PersonaAvatar";

interface MessageBubbleProps {
  message: Message;
  persona: Persona;
  isSpeakingThis?: boolean;
  onReplay?: () => void;
}

export default function MessageBubble({
  message,
  persona,
  isSpeakingThis,
  onReplay,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

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

  return (
    <div className="flex items-end gap-2.5">
      <PersonaAvatar persona={persona} size="sm" />
      <div className="flex max-w-[80%] flex-col gap-1.5">
        <div
          className={`rounded-2xl rounded-bl-md border px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-sm backdrop-blur-xl ${
            isSpeakingThis
              ? "border-white bg-white/95 ring-2"
              : "border-white/60 bg-white/75"
          }`}
          style={
            isSpeakingThis
              ? ({ ringColor: `${persona.accentHex}55` } as CSSProperties)
              : undefined
          }
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {onReplay && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onReplay();
            }}
            disabled={isSpeakingThis}
            className="flex w-fit items-center gap-1.5 rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-xs font-medium shadow-sm transition hover:bg-white disabled:opacity-60"
            style={{ color: persona.accentHex }}
            title={isSpeakingThis ? "Playing…" : "Replay message audio"}
          >
            {isSpeakingThis ? (
              <>
                <span
                  className="h-2 w-2 animate-pulse rounded-full"
                  style={{ backgroundColor: persona.accentHex }}
                />
                Playing…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Replay
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
