"use client";

import type { Message } from "@/lib/types";
import type { Persona } from "@/lib/personas";
import PersonaAvatar from "./PersonaAvatar";

interface MessageBubbleProps {
  message: Message;
  persona: Persona;
  onReplay?: () => void;
}

export default function MessageBubble({ message, persona, onReplay }: MessageBubbleProps) {
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
      <div className="group relative max-w-[80%]">
        <div className="rounded-2xl rounded-bl-md border border-white/60 bg-white/75 px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-sm backdrop-blur-xl">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {onReplay && (
          <button
            type="button"
            onClick={onReplay}
            className="absolute -bottom-2.5 right-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/80 bg-white/90 shadow-sm transition-opacity hover:opacity-80 active:opacity-60"
            style={{ color: persona.accentHex }}
            title="Replay"
          >
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
