"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Persona } from "@/lib/personas";
import type { PreparedImage } from "@/lib/types";
import { prepareImage } from "@/lib/imageAttachment";

interface ChatInputProps {
  persona: Persona;
  onSend: (message: string, image?: PreparedImage) => void;
  disabled?: boolean;
  voiceMode?: boolean;
  isListening?: boolean;
  interimTranscript?: string;
  isSpeechSupported?: boolean;
  sttHint?: string;
  onStartListening?: () => void;
  onStopListening?: () => void;
}

export default function ChatInput({
  persona,
  onSend,
  disabled = false,
  voiceMode = false,
  isListening = false,
  interimTranscript = "",
  isSpeechSupported = false,
  sttHint,
  onStartListening,
  onStopListening,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickImage = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    setIsPreparing(true);
    try {
      setImage(await prepareImage(file));
    } catch (error) {
      setImage(null);
      setImageError(
        error instanceof Error ? error.message : "Couldn't use that photo."
      );
    } finally {
      setIsPreparing(false);
      // Reset so picking the same photo again still fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const canSend = (value.trim().length > 0 || image !== null) && !isPreparing;

  const handleSend = () => {
    const trimmed = value.trim();
    if (!canSend || disabled) return;
    onSend(trimmed, image ?? undefined);
    setValue("");
    setImage(null);
    setImageError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const displayValue = isListening && interimTranscript ? interimTranscript : value;
  const placeholder = isListening
    ? "Listening… speak in English or Cantonese"
    : voiceMode
      ? "Tap mic to talk, or type here…"
      : "Say something…";

  return (
    <div className="border-t border-white/50 bg-white/60 p-4 backdrop-blur-xl">
      {isListening && (
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
          <span
            className="h-2 w-2 animate-pulse rounded-full"
            style={{ backgroundColor: persona.accentHex }}
          />
          {sttHint ?? "Listening — you can pause up to 5s"}
        </div>
      )}

      {(image || isPreparing || imageError) && (
        <div className="mb-2 flex items-center gap-2">
          {image && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.thumbnail}
                alt="Photo to send"
                className="h-16 w-16 rounded-xl border border-white/80 object-cover shadow-sm"
              />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-600 shadow-md hover:text-slate-900"
                aria-label="Remove photo"
                title="Remove photo"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeWidth={2.5} d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}
          {isPreparing && (
            <span className="text-xs text-slate-500">Preparing photo…</span>
          )}
          {imageError && (
            <span className="text-xs text-rose-600">{imageError}</span>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handlePickImage(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isListening || isPreparing}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/90 text-slate-600 transition-all hover:bg-white disabled:opacity-40"
          aria-label="Attach a photo"
          title="Attach a photo"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="14" rx="3" strokeWidth={2} />
            <circle cx="9" cy="10" r="1.75" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 16l-5-5-8 8" />
          </svg>
        </button>

        {isSpeechSupported && (
          <button
            type="button"
            onClick={() =>
              isListening ? onStopListening?.() : onStartListening?.()
            }
            disabled={disabled && !isListening}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-all disabled:opacity-40 ${
              isListening
                ? "border-transparent text-white shadow-md animate-pulse"
                : "border-white/80 bg-white/90 text-slate-600 hover:bg-white"
            }`}
            style={
              isListening ? { backgroundColor: persona.accentHex } : undefined
            }
            aria-label={isListening ? "Stop listening" : "Start voice input"}
            title={isListening ? "Stop" : "Talk (English / Cantonese)"}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={displayValue}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled || isListening}
          placeholder={placeholder}
          rows={1}
          className="max-h-[120px] min-h-[44px] flex-1 resize-none rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:opacity-50"
          style={
            {
              "--tw-ring-color": persona.accentHex,
            } as CSSProperties
          }
        />

        <button
          type="button"
          // While recording, Send finalizes the voice input and sends it right
          // away (no 3s wait). Otherwise it sends the typed text.
          onClick={() => (isListening ? onStopListening?.() : handleSend())}
          disabled={isListening ? false : disabled || !canSend}
          className="flex h-11 shrink-0 items-center justify-center rounded-2xl px-5 text-sm font-medium text-white shadow-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: persona.accentHex }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
