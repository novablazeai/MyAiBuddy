"use client";

import type { Message } from "@/lib/types";
import type { Persona } from "@/lib/personas";
import PersonaAvatar from "./PersonaAvatar";

interface MessageBubbleProps {
  message: Message;
  persona: Persona;
}

export default function MessageBubble({ message, persona }: MessageBubbleProps) {
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
      <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-white/60 bg-white/75 px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-sm backdrop-blur-xl">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  );
}
