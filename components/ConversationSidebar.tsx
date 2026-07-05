"use client";

import { useState } from "react";
import type { Conversation } from "@/lib/types";
import { personas } from "@/lib/personas";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (conversation: Conversation) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ConversationSidebar({
  conversations,
  activeConversationId,
  isOpen,
  onClose,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const grouped = personas.map((persona) => ({
    persona,
    conversations: conversations.filter((c) => c.personaId === persona.id),
  }));

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title);
  };

  const commitEditing = () => {
    if (editingId) onRename(editingId, editValue);
    setEditingId(null);
    setEditValue("");
  };

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px] md:hidden"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/60 bg-white/80 shadow-xl backdrop-blur-xl transition-transform duration-300 md:static md:z-0 md:translate-x-0 md:shadow-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/50 p-4">
          <h2 className="font-serif text-lg font-semibold text-slate-800">
            Chats
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white/60 md:hidden"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={onNewChat}
            className="w-full rounded-xl border border-white/60 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white/90"
          >
            + New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {grouped.map(({ persona, conversations: convs }) => (
            <div key={persona.id} className="mb-4">
              <div className="mb-1.5 flex items-center gap-2 px-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: persona.accentHex }}
                />
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {persona.name}
                </span>
              </div>

              {convs.length === 0 ? (
                <p className="px-2 text-xs text-slate-400">No chats yet</p>
              ) : (
                convs.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  const isEditing = editingId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      className={`group mb-0.5 flex items-center rounded-xl transition ${
                        isActive ? "bg-white/90 shadow-sm" : "hover:bg-white/60"
                      }`}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEditing}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEditing();
                            } else if (e.key === "Escape") {
                              setEditingId(null);
                              setEditValue("");
                            }
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2"
                          style={{ ["--tw-ring-color" as string]: persona.accentHex }}
                          maxLength={80}
                          aria-label="Rename conversation"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelect(conv)}
                          onDoubleClick={() => startEditing(conv)}
                          className="min-w-0 flex-1 px-3 py-2.5 text-left"
                        >
                          <p className="truncate text-sm font-medium text-slate-800">
                            {conv.title}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatDate(conv.updatedAt)}
                          </p>
                        </button>
                      )}

                      {!isEditing && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(conv);
                            }}
                            className="rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-700 group-hover:opacity-100"
                            aria-label="Rename conversation"
                            title="Rename"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(conv.id);
                            }}
                            className="mr-2 rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                            aria-label="Delete conversation"
                            title="Delete"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
