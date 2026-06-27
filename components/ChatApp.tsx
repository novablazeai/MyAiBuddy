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
  saveConversation,
} from "@/lib/chatStorage";
import {
  getVoiceModePreference,
  setVoiceModePreference,
  speakText,
  stopSpeaking,
  unlockAudio,
} from "@/lib/speech";
import type { Conversation, LangMode, Message } from "@/lib/types";
import ChatWindow from "./ChatWindow";
import ConversationSidebar from "./ConversationSidebar";
import PersonaSwitcher from "./PersonaSwitcher";

type VoiceActivity = "idle" | "speaking";

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
  const [voiceActivity, setVoiceActivity] = useState<VoiceActivity>("idle");
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(
    null
  );
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const cancelSpeakRef = useRef<(() => void) | null>(null);
  const voiceModeRef = useRef(voiceMode);
  const langModeRef = useRef(langMode);
  const handleSendRef = useRef<(content: string) => void>(() => {});

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    langModeRef.current = langMode;
  }, [langMode]);

  const persona = getPersona(activeConversation.personaId);

  const {
    isListening,
    interimTranscript,
    startListening,
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
    cancelSpeakRef.current?.();
    cancelSpeakRef.current = null;
    stopSpeaking();
    setVoiceActivity((a) => (a === "speaking" ? "idle" : a));
    setSpeakingMessageId(null);
  }, []);

  const haltVoice = useCallback(() => {
    stopPlayback();
    cancelListening();
    setVoiceActivity("idle");
  }, [cancelListening, stopPlayback]);

  const playMessage = useCallback(
    (text: string, personaId: string, messageId?: string) => {
      if (!text.trim()) return;

      cancelListening();
      stopPlayback();

      unlockAudio();

      setVoiceActivity("speaking");
      setSpeakingMessageId(messageId ?? null);
      setVoiceError(null);

      cancelSpeakRef.current = speakText(
        text,
        personaId,
        () => {
          setVoiceActivity("idle");
          setSpeakingMessageId(null);
          cancelSpeakRef.current = null;
        },
        (err) => {
          setVoiceActivity("idle");
          setSpeakingMessageId(null);
          cancelSpeakRef.current = null;
          setVoiceError(err);
        }
      );
    },
    [cancelListening, stopPlayback]
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
    cancelListening();
  }, [cancelListening]);

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
        title: isFirstMessage
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
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk;
          setStreamingContent(fullContent);
        }

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
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

        if (voiceModeRef.current && fullContent.trim()) {
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

  const isSpeaking = voiceActivity === "speaking";
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
            speakingMessageId={speakingMessageId}
            voiceMode={voiceMode}
            voiceError={voiceError}
            langMode={langMode}
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
