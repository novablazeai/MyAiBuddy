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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const cancelSpeakRef = useRef<(() => void) | null>(null);
  const voiceModeRef = useRef(voiceMode);
  const handleSendRef = useRef<(content: string) => void>(() => {});

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  const persona = getPersona(activeConversation.personaId);

  const {
    isListening,
    interimTranscript,
    startListening,
    stopListening,
    isSupported: isSpeechSupported,
  } = useSpeechRecognition({
    onResult: (transcript) => {
      setVoiceError(null);
      if (transcript.trim()) {
        handleSendRef.current(transcript.trim());
      }
    },
    onError: (message) => setVoiceError(message),
  });

  const setActiveConversation = useCallback((conv: Conversation) => {
    setAppState((prev) => ({ ...prev, activeConversation: conv }));
  }, []);

  const haltVoice = useCallback(() => {
    cancelSpeakRef.current?.();
    cancelSpeakRef.current = null;
    stopSpeaking();
    stopListening();
    setIsSpeaking(false);
  }, [stopListening]);

  const speakResponse = useCallback(
    (text: string, personaId: string) => {
      haltVoice();
      setIsSpeaking(true);
      cancelSpeakRef.current = speakText(text, personaId, () => {
        setIsSpeaking(false);
        cancelSpeakRef.current = null;
        if (voiceModeRef.current) {
          startListening("auto");
        }
      });
    },
    [haltVoice, startListening]
  );

  const handleToggleVoiceMode = useCallback(() => {
    setVoiceMode((prev) => {
      const next = !prev;
      setVoiceModePreference(next);
      if (!next) haltVoice();
      return next;
    });
  }, [haltVoice]);

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
          speakResponse(fullContent, personaId);
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
      isSpeaking,
      isStreaming,
      setActiveConversation,
      speakResponse,
    ]
  );

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

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
            voiceMode={voiceMode}
            voiceError={voiceError}
            langMode={langMode}
            onSend={handleSend}
            onSpeakMessage={speakResponse}
            onToggleVoiceMode={handleToggleVoiceMode}
            onSetLangMode={handleSetLangMode}
            onStopSpeaking={haltVoice}
            isListening={isListening}
            interimTranscript={interimTranscript}
            isSpeechSupported={isSpeechSupported}
            onStartListening={() => {
              unlockAudio();
              setVoiceError(null);
              // Stop TTS only — don't call haltVoice() which also calls
              // stopListening() and triggers an async onend that races with
              // the new recognition session starting below.
              cancelSpeakRef.current?.();
              cancelSpeakRef.current = null;
              stopSpeaking();
              setIsSpeaking(false);
              startListening("auto");
            }}
            onStopListening={stopListening}
          />
        </div>
      </div>
    </div>
  );
}
