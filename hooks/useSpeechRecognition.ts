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
  // Transcript is split into three buffers to avoid the classic Web Speech
  // duplication/looping bug: `committed` = finals from ENDED sessions,
  // `sessionFinal` = finals recomputed fresh for the CURRENT session (never
  // appended incrementally), `interim` = the live, not-yet-final words.
  const committedRef = useRef("");
  const sessionFinalRef = useRef("");
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
    for (const ref of [pendingStartRef, silenceTimerRef, restartTimerRef]) {
      if (ref.current !== null) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    }
  }, []);

  const resetTranscript = useCallback(() => {
    committedRef.current = "";
    sessionFinalRef.current = "";
    interimRef.current = "";
  }, []);

  const fullTranscript = useCallback(
    () =>
      [committedRef.current, sessionFinalRef.current, interimRef.current]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ")
        .trim(),
    []
  );

  const cancelListening = useCallback(() => {
    wantsMicRef.current = false;
    generationRef.current += 1;
    clearTimers();
    resetTranscript();

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
  }, [clearTimers, resetTranscript]);

  /**
   * Manually stop the mic and IMMEDIATELY send whatever was captured — no
   * waiting for the silence timeout. Used when the user taps the mic to stop.
   */
  const stopListening = useCallback(() => {
    if (!wantsMicRef.current) return;

    wantsMicRef.current = false;
    generationRef.current += 1;
    clearTimers();

    const text = fullTranscript();
    resetTranscript();

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
  }, [clearTimers, fullTranscript, resetTranscript]);

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
      resetTranscript();
      const generation = generationRef.current;
      const lang = recognitionLangFromMode(langMode);

      const isStale = () =>
        generation !== generationRef.current || !wantsMicRef.current;

      const endSession = () => {
        if (isStale()) return;
        clearTimers();
        wantsMicRef.current = false;

        const text = fullTranscript();
        resetTranscript();

        const recognition = recognitionRef.current;
        recognitionRef.current = null;
        if (recognition) {
          try {
            recognition.abort();
          } catch {
            /* ok */
          }
        }

        setIsListening(false);
        setInterimTranscript("");
        if (text) onResultRef.current(text);
      };

      const scheduleSilenceTimeout = () => {
        if (silenceTimerRef.current !== null) {
          clearTimeout(silenceTimerRef.current);
        }
        silenceTimerRef.current = setTimeout(endSession, SILENCE_TIMEOUT_MS);
      };

      const startSession = () => {
        if (isStale()) return;

        const recognition = new Ctor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = lang;
        recognitionRef.current = recognition;

        recognition.onstart = () => {
          if (isStale()) return;
          setIsListening(true);
          scheduleSilenceTimeout();
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          if (isStale() || recognitionRef.current !== recognition) return;

          // Recompute this session's transcript from ALL results each time —
          // never append incrementally, so re-delivered results can't loop.
          let sessionFinal = "";
          let interim = "";
          for (let i = 0; i < event.results.length; i += 1) {
            const result = event.results[i];
            if (result.isFinal) sessionFinal += result[0].transcript;
            else interim += result[0].transcript;
          }
          sessionFinalRef.current = sessionFinal.trim();
          interimRef.current = interim.trim();

          setInterimTranscript(fullTranscript());
          scheduleSilenceTimeout();
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          if (generation !== generationRef.current) return;
          if (event.error === "aborted" || event.error === "no-speech") return;

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
          if (isStale() || recognitionRef.current !== recognition) {
            if (isStale()) setIsListening(false);
            return;
          }

          // Fold this session's final text into the committed buffer, then
          // start a FRESH recognizer so the next session's results are clean.
          const finalized = sessionFinalRef.current.trim();
          if (finalized) {
            committedRef.current = [committedRef.current, finalized]
              .filter(Boolean)
              .join(" ");
          }
          sessionFinalRef.current = "";
          interimRef.current = "";

          restartTimerRef.current = setTimeout(() => {
            restartTimerRef.current = null;
            startSession();
          }, 150);
        };

        try {
          recognition.start();
        } catch {
          onErrorRef.current?.("Mic is busy. Wait a moment and try again.");
          cancelListening();
        }
      };

      pendingStartRef.current = setTimeout(() => {
        pendingStartRef.current = null;
        startSession();
      }, 100);
    },
    [cancelListening, clearTimers, fullTranscript, resetTranscript]
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
