"use client";

import { useEffect, useRef } from "react";
import type { LangMode, Message } from "@/lib/types";
import type { Persona } from "@/lib/personas";
import MessageBubble from "./MessageBubble";
import PersonaAvatar from "./PersonaAvatar";
import ChatInput from "./ChatInput";

interface ChatWindowProps {
  persona: Persona;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  isSpeaking: boolean;
  voiceMode: boolean;
  voiceError: string | null;
  langMode: LangMode;
  onSend: (message: string) => void;
  onToggleVoiceMode: () => void;
  onSetLangMode: (mode: LangMode) => void;
  onStopSpeaking: () => void;
  isListening: boolean;
  interimTranscript: string;
  isSpeechSupported: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
}

function TypingIndicator({ accentHex }: { accentHex: string }) {
  return (
    <div className="flex items-end gap-2.5">
      <div className="flex gap-1 rounded-2xl border border-white/60 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-xl">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-pulse rounded-full"
            style={{
              backgroundColor: accentHex,
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChatWindow({
  persona,
  messages,
  isStreaming,
  streamingContent,
  isSpeaking,
  voiceMode,
  voiceError,
  langMode,
  onSend,
  onToggleVoiceMode,
  onSetLangMode,
  onStopSpeaking,
  isListening,
  interimTranscript,
  isSpeechSupported,
  onStartListening,
  onStopListening,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isStreaming]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-white/50 bg-white/60 px-4 py-3 backdrop-blur-xl">
        <div className="relative">
          <PersonaAvatar persona={persona} size="md" />
          {isSpeaking && (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow"
              title="Speaking"
            >
              <span
                className="h-2.5 w-2.5 animate-pulse rounded-full"
                style={{ backgroundColor: persona.accentHex }}
              />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1
            className="font-serif text-lg font-semibold leading-tight"
            style={{ color: persona.accentHex }}
          >
            {persona.name}
          </h1>
          <p className="text-xs text-slate-500">
            {isSpeaking
              ? "Speaking…"
              : isStreaming
                ? "Thinking…"
                : persona.tagline}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Language toggle: neither active = auto (mirrors user's language) */}
          <div className="flex overflow-hidden rounded-full border border-white/80 bg-white/70">
            {(["cantonese", "english"] as Exclude<LangMode, "auto">[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onSetLangMode(langMode === mode ? "auto" : mode)}
                className={`px-2.5 py-1.5 text-xs font-medium transition ${
                  langMode === mode ? "text-white" : "text-slate-500 hover:bg-white/60"
                }`}
                style={langMode === mode ? { backgroundColor: persona.accentHex } : undefined}
                title={mode === "cantonese" ? "Force Cantonese replies" : "Force English replies"}
              >
                {mode === "cantonese" ? "粵" : "EN"}
              </button>
            ))}
          </div>

          {isSpeaking && (
            <button
              type="button"
              onClick={onStopSpeaking}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-white/60"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={onToggleVoiceMode}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              voiceMode
                ? "border-transparent text-white shadow-sm"
                : "border-white/80 bg-white/70 text-slate-600 hover:bg-white/90"
            }`}
            style={voiceMode ? { backgroundColor: persona.accentHex } : undefined}
            title={
              voiceMode
                ? "Voice on — companion speaks replies"
                : "Voice off — text only"
            }
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              {voiceMode ? (
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              ) : (
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              )}
            </svg>
            Voice
          </button>
        </div>

        <div
          className="hidden h-8 w-1 rounded-full sm:block"
          style={{ backgroundColor: persona.accentHex }}
        />
      </header>

      {voiceError && (
        <div className="mx-4 mt-2 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-800">
          {voiceError}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <PersonaAvatar persona={persona} size="lg" className="mb-4" />
            <p className="font-serif text-xl font-semibold text-slate-700">
              Hey Sam 👋
            </p>
            <p className="mt-2 max-w-sm text-sm text-slate-500">
              Talk or type in English or Cantonese — {persona.name} will speak
              back when voice mode is on.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} persona={persona} />
        ))}

        {isStreaming && streamingContent && (
          <div className="flex items-end gap-2.5">
            <PersonaAvatar persona={persona} size="sm" />
            <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-white/60 bg-white/75 px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-sm backdrop-blur-xl">
              <p className="whitespace-pre-wrap break-words">
                {streamingContent}
              </p>
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && (
          <TypingIndicator accentHex={persona.accentHex} />
        )}

        <div ref={bottomRef} />
      </div>

      <ChatInput
        persona={persona}
        onSend={onSend}
        disabled={isStreaming || isSpeaking}
        voiceMode={voiceMode}
        isListening={isListening}
        interimTranscript={interimTranscript}
        isSpeechSupported={isSpeechSupported}
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />
    </div>
  );
}
