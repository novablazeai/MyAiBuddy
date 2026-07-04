"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LangMode } from "@/lib/types";
import { recognitionLangFromMode } from "@/lib/speech";

/** Pause tolerance before auto-sending and closing the mic. */
const SILENCE_TIMEOUT_MS = 3000;

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    webkitSpeechRecognition?: SpeechRecognitionCtor;
    SpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface UseSpeechRecognitionOptions {
  onResult: (transcript: string) => void;
  onError?: (message: string) => void;
}

export function useSpeechRecognition({
  onResult,
  onError,
}: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const pendingStartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedRef = useRef("");
  const interimRef = useRef("");
  const generationRef = useRef(0);
  const wantsMicRef = useRef(false);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  const clearTimers = useCallback(() => {
    if (pendingStartRef.current !== null) {
      clearTimeout(pendingStartRef.current);
      pendingStartRef.current = null;
    }
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const cancelListening = useCallback(() => {
    wantsMicRef.current = false;
    generationRef.current += 1;
    clearTimers();
    accumulatedRef.current = "";
    interimRef.current = "";

    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition) {
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
    }

    setIsListening(false);
    setInterimTranscript("");
  }, [clearTimers]);

  /**
   * Manually stop the mic and IMMEDIATELY send whatever was captured — no
   * waiting for the silence timeout. Includes the last interim words that
   * haven't been finalized yet. Used when the user taps the mic to stop.
   */
  const stopListening = useCallback(() => {
    if (!wantsMicRef.current) return;

    wantsMicRef.current = false;
    generationRef.current += 1;
    clearTimers();

    const text = [accumulatedRef.current, interimRef.current]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    accumulatedRef.current = "";
    interimRef.current = "";

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
    }

    setIsListening(false);
    setInterimTranscript("");

    if (text) onResultRef.current(text);
  }, [clearTimers]);

  const startListening = useCallback(
    (langMode: LangMode = "auto") => {
      const Ctor = getSpeechRecognition();
      if (!Ctor) {
        onErrorRef.current?.(
          "Voice input isn't supported in this browser. Try Chrome or Safari."
        );
        return;
      }

      cancelListening();
      wantsMicRef.current = true;
      const generation = generationRef.current;
      const lang = recognitionLangFromMode(langMode);

      const endSession = (recognition: SpeechRecognition) => {
        if (generation !== generationRef.current || !wantsMicRef.current) return;

        clearTimers();
        wantsMicRef.current = false;

        const text = [accumulatedRef.current, interimRef.current]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        accumulatedRef.current = "";
        interimRef.current = "";
        recognitionRef.current = null;

        try {
          recognition.abort();
        } catch {
          /* ok */
        }

        setIsListening(false);
        setInterimTranscript("");

        if (text) {
          onResultRef.current(text);
        }
      };

      const scheduleSilenceTimeout = (recognition: SpeechRecognition) => {
        if (silenceTimerRef.current !== null) {
          clearTimeout(silenceTimerRef.current);
        }
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          endSession(recognition);
        }, SILENCE_TIMEOUT_MS);
      };

      const attachHandlers = (recognition: SpeechRecognition) => {
        recognition.onstart = () => {
          if (generation !== generationRef.current || !wantsMicRef.current) return;
          setIsListening(true);
          scheduleSilenceTimeout(recognition);
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          if (generation !== generationRef.current || !wantsMicRef.current) return;

          let interim = "";
          let final = "";

          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            if (result.isFinal) {
              final += result[0].transcript;
            } else {
              interim += result[0].transcript;
            }
          }

          if (final.trim()) {
            const chunk = final.trim();
            accumulatedRef.current = accumulatedRef.current
              ? `${accumulatedRef.current} ${chunk}`
              : chunk;
          }

          interimRef.current = interim.trim();

          const display = [accumulatedRef.current, interim.trim()]
            .filter(Boolean)
            .join(" ");
          setInterimTranscript(display);

          scheduleSilenceTimeout(recognition);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          if (generation !== generationRef.current) return;

          if (event.error === "aborted") return;

          if (event.error === "no-speech") {
            // Keep mic open — onend will restart if we're still in listen mode.
            return;
          }

          onErrorRef.current?.(
            event.error === "not-allowed"
              ? "Microphone access denied. Allow mic in browser settings."
              : event.error === "network"
                ? "Speech recognition needs internet. Check your connection."
                : `Couldn't hear you (${event.error}). Tap mic and try again.`
          );
          cancelListening();
        };

        recognition.onend = () => {
          if (generation !== generationRef.current || !wantsMicRef.current) {
            setIsListening(false);
            return;
          }

          if (recognitionRef.current !== recognition) return;

          // Browser ended the session (common on pause) — restart while user still wants mic.
          restartTimerRef.current = setTimeout(() => {
            restartTimerRef.current = null;
            if (
              generation !== generationRef.current ||
              !wantsMicRef.current ||
              recognitionRef.current !== recognition
            ) {
              return;
            }
            try {
              recognition.start();
            } catch {
              endSession(recognition);
            }
          }, 150);
        };
      };

      pendingStartRef.current = setTimeout(() => {
        pendingStartRef.current = null;
        if (generation !== generationRef.current || !wantsMicRef.current) return;

        const recognition = new Ctor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = lang;
        recognitionRef.current = recognition;
        attachHandlers(recognition);

        try {
          recognition.start();
        } catch {
          onErrorRef.current?.("Mic is busy. Wait a moment and try again.");
          cancelListening();
        }
      }, 100);
    },
    [cancelListening, clearTimers]
  );

  useEffect(() => {
    return () => {
      cancelListening();
    };
  }, [cancelListening]);

  return {
    isListening,
    interimTranscript,
    startListening,
    stopListening,
    cancelListening,
    isSupported: typeof window !== "undefined" && !!getSpeechRecognition(),
  };
}
