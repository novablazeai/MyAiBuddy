"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { getPersona } from "@/lib/personas";
import {
  createConversation,
  deleteConversation,
  generateTitle,
  getConversations,
  getLatestConversationForPersona,
  renameConversation,
  saveConversation,
} from "@/lib/chatStorage";
import {
  getVoiceModePreference,
  getVoicePreference,
  playMessage as playMessageAudio,
  setVoiceModePreference,
  setVoicePreference,
  stopPlayback as stopPlayerPlayback,
  unlockAudio,
} from "@/lib/speech";
import { PERSONA_VOICE_OPTIONS } from "@/lib/voices";
import { toSpokenCantonese } from "@/lib/cantonese";
import { useAudioPlayerStatus } from "@/hooks/useAudioPlayer";
import type { Conversation, LangMode, Message } from "@/lib/types";
import ChatWindow from "./ChatWindow";
import ConversationSidebar from "./ConversationSidebar";
import PersonaSwitcher from "./PersonaSwitcher";

function getInitialState(): {
  conversations: Conversation[];
  activeConversation: Conversation;
} {
  const stored = getConversations();
  const latest =
    getLatestConversationForPersona("adrian") ?? createConversation("adrian");
  if (!stored.find((c) => c.id === latest.id)) {
    saveConversation(latest);
  }
  return {
    conversations: getConversations(),
    activeConversation: latest,
  };
}

export default function ChatApp() {
  const [{ conversations, activeConversation }, setAppState] = useState(
    getInitialState
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [langMode, setLangMode] = useState<LangMode>(() => {
    if (typeof window === "undefined") return "auto";
    return (localStorage.getItem("myaibuddy_lang") as LangMode) ?? "auto";
  });

  const handleSetLangMode = useCallback((mode: LangMode) => {
    setLangMode(mode);
    localStorage.setItem("myaibuddy_lang", mode);
  }, []);

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [voiceMode, setVoiceMode] = useState(getVoiceModePreference);
  const [voiceId, setVoiceId] = useState<string>(() =>
    getVoicePreference(activeConversation.personaId)
  );
  const [voicePersonaId, setVoicePersonaId] = useState(
    activeConversation.personaId
  );
  // Re-read the saved voice when the active persona changes (during render, the
  // React-recommended way to derive state from a changing value).
  if (voicePersonaId !== activeConversation.personaId) {
    setVoicePersonaId(activeConversation.personaId);
    setVoiceId(getVoicePreference(activeConversation.personaId));
  }
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const playerStatus = useAudioPlayerStatus();
  const isSpeaking =
    playerStatus.status === "playing" || playerStatus.status === "paused";
  const voiceModeRef = useRef(voiceMode);
  const langModeRef = useRef(langMode);
  const handleSendRef = useRef<(content: string) => void>(() => {});

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    langModeRef.current = langMode;
  }, [langMode]);

  const handleSelectVoice = useCallback(
    (id: string) => {
      setVoicePreference(activeConversation.personaId, id);
      setVoiceId(id);
      stopPlayerPlayback(); // drop any in-progress audio so the next uses it
    },
    [activeConversation.personaId]
  );

  const persona = getPersona(activeConversation.personaId);

  const {
    isListening,
    interimTranscript,
    startListening,
    stopListening,
    cancelListening,
    isSupported: isSpeechSupported,
  } = useSpeechRecognition({
    onResult: (transcript) => {
      setVoiceError(null);
      if (transcript.trim()) {
        handleSendRef.current(transcript.trim());
      }
    },
    onError: (message) => {
      setVoiceError(message);
    },
  });

  const setActiveConversation = useCallback((conv: Conversation) => {
    setAppState((prev) => ({ ...prev, activeConversation: conv }));
  }, []);

  const stopPlayback = useCallback(() => {
    stopPlayerPlayback();
  }, []);

  const haltVoice = useCallback(() => {
    stopPlayerPlayback();
    cancelListening();
  }, [cancelListening]);

  const playMessage = useCallback(
    (text: string, personaId: string, messageId: string) => {
      if (!text.trim()) return;
      cancelListening();
      unlockAudio();
      setVoiceError(null);
      void playMessageAudio(text, personaId, messageId);
    },
    [cancelListening]
  );

  const handleToggleVoiceMode = useCallback(() => {
    setVoiceMode((prev) => {
      const next = !prev;
      setVoiceModePreference(next);
      if (!next) haltVoice();
      return next;
    });
  }, [haltVoice]);

  const handleStartListening = useCallback(() => {
    unlockAudio();
    stopPlayback();
    setVoiceError(null);
    startListening(langModeRef.current);
  }, [startListening, stopPlayback]);

  const handleStopListening = useCallback(() => {
    // Tapping the mic to stop finalizes and sends immediately (no silence wait).
    stopListening();
  }, [stopListening]);

  const switchPersona = useCallback(
    (personaId: string) => {
      haltVoice();
      const existing = getLatestConversationForPersona(personaId);
      const conv = existing ?? createConversation(personaId);
      if (!existing) {
        saveConversation(conv);
      }
      setAppState({
        conversations: getConversations(),
        activeConversation: conv,
      });
      setStreamingContent("");
      setIsStreaming(false);
    },
    [haltVoice]
  );

  const handleNewChat = useCallback(() => {
    haltVoice();
    const conv = createConversation(activeConversation.personaId);
    saveConversation(conv);
    setAppState({
      conversations: getConversations(),
      activeConversation: conv,
    });
    setSidebarOpen(false);
  }, [activeConversation.personaId, haltVoice]);

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      haltVoice();
      setActiveConversation(conv);
      setStreamingContent("");
      setIsStreaming(false);
      setSidebarOpen(false);
    },
    [haltVoice, setActiveConversation]
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation(id);
      const remaining = getConversations();

      if (activeConversation.id === id) {
        haltVoice();
        const personaId = activeConversation.personaId;
        const next =
          remaining.find((c) => c.personaId === personaId) ??
          createConversation(personaId);
        if (!remaining.find((c) => c.id === next.id)) {
          saveConversation(next);
        }
        setAppState({
          conversations: getConversations(),
          activeConversation: next,
        });
      } else {
        setAppState((prev) => ({
          ...prev,
          conversations: remaining,
        }));
      }
    },
    [activeConversation, haltVoice]
  );

  const handleRenameConversation = useCallback((id: string, title: string) => {
    renameConversation(id, title);
    const cleaned = title.trim() || "New chat";
    setAppState((prev) => ({
      conversations: getConversations(),
      activeConversation:
        prev.activeConversation.id === id
          ? { ...prev.activeConversation, title: cleaned }
          : prev.activeConversation,
    }));
  }, []);

  const handleReplay = useCallback(
    (message: Message) => {
      unlockAudio();
      playMessage(message.content, message.personaId, message.id);
    },
    [playMessage]
  );

  const handleSend = useCallback(
    async (content: string) => {
      unlockAudio();
      if (isStreaming) return;

      haltVoice();
      setVoiceError(null);

      const personaId = activeConversation.personaId;
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: Date.now(),
        personaId,
      };

      const isFirstMessage = activeConversation.messages.length === 0;
      let conv: Conversation = {
        ...activeConversation,
        messages: [...activeConversation.messages, userMessage],
        // Auto-title only an untouched "New chat" — never overwrite a name the
        // user set themselves.
        title:
          isFirstMessage && activeConversation.title.trim() === "New chat"
            ? generateTitle(content)
            : activeConversation.title,
        updatedAt: Date.now(),
      };

      setActiveConversation(conv);
      setIsStreaming(true);
      setStreamingContent("");

      const apiMessages = conv.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const assistantId = crypto.randomUUID();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, personaId, langMode }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let raw = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          raw += chunk;
          // Fix stray written-Chinese slips (我是→我係) live as it streams.
          setStreamingContent(toSpokenCantonese(raw));
        }

        const fullContent = toSpokenCantonese(raw);

        const assistantMessage: Message = {
          id: assistantId,
          role: "assistant",
          content: fullContent,
          timestamp: Date.now(),
          personaId,
        };

        conv = {
          ...conv,
          messages: [...conv.messages, assistantMessage],
          updatedAt: Date.now(),
        };

        saveConversation(conv);
        setAppState({
          conversations: getConversations(),
          activeConversation: conv,
        });

        // One TTS call for the whole reply — keeps Adrian's voice consistent
        // (Gemini TTS drifts between calls, so we never split a reply).
        if (fullContent.trim()) {
          unlockAudio();
          playMessage(fullContent, personaId, assistantMessage.id);
        }
      } catch (error) {
        const errorText =
          error instanceof Error
            ? `Something went wrong: ${error.message}`
            : "Something went wrong. Try again?";

        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorText,
          timestamp: Date.now(),
          personaId,
        };

        conv = {
          ...conv,
          messages: [...conv.messages, errorMessage],
          updatedAt: Date.now(),
        };
        saveConversation(conv);
        setAppState({
          conversations: getConversations(),
          activeConversation: conv,
        });
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
      }
    },
    [
      activeConversation,
      haltVoice,
      isStreaming,
      langMode,
      playMessage,
      setActiveConversation,
    ]
  );

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const showListening = isListening;

  return (
    <div className="flex h-full overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeConversation.id}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-white/50 bg-white/50 px-3 py-2 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-white/60 md:hidden"
            aria-label="Open sidebar"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="hidden md:block">
            <p className="font-serif text-sm font-semibold text-slate-700">
              MyAIBuddy
            </p>
          </div>
        </div>

        <PersonaSwitcher
          activePersonaId={persona.id}
          onSwitch={switchPersona}
        />

        <div className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/75 shadow-lg backdrop-blur-xl">
          <ChatWindow
            persona={persona}
            messages={activeConversation.messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            isSpeaking={isSpeaking}
            isListening={showListening}
            voiceMode={voiceMode}
            voiceError={voiceError ?? playerStatus.error}
            langMode={langMode}
            voiceId={voiceId}
            voiceOptions={PERSONA_VOICE_OPTIONS[persona.id] ?? PERSONA_VOICE_OPTIONS.adrian}
            onSelectVoice={handleSelectVoice}
            onSend={handleSend}
            onReplay={handleReplay}
            onToggleVoiceMode={handleToggleVoiceMode}
            onSetLangMode={handleSetLangMode}
            onStopSpeaking={haltVoice}
            interimTranscript={interimTranscript}
            isSpeechSupported={isSpeechSupported}
            onStartListening={handleStartListening}
            onStopListening={handleStopListening}
          />
        </div>
      </div>
    </div>
  );
}
