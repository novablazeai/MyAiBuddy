import type { Conversation } from "./types";

const STORAGE_KEY = "myaibuddy_conversations";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getConversations(): Conversation[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function getConversation(id: string): Conversation | null {
  return getConversations().find((c) => c.id === id) ?? null;
}

export function saveConversation(conv: Conversation): void {
  if (!isBrowser()) return;
  const conversations = getConversations();
  const index = conversations.findIndex((c) => c.id === conv.id);
  const updated = { ...conv, updatedAt: Date.now() };
  if (index >= 0) {
    conversations[index] = updated;
  } else {
    conversations.push(updated);
  }
  writeConversations(conversations, conv.id);
}

/**
 * Persist all conversations. Photo thumbnails make history bigger, so if the
 * browser's storage quota is hit, drop thumbnails from other chats first (the
 * text and photo notes stay), then from everything, rather than losing the
 * message itself.
 */
function writeConversations(conversations: Conversation[], keepId?: string) {
  const attempt = (list: Conversation[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };
  const stripThumbs = (c: Conversation): Conversation => ({
    ...c,
    messages: c.messages.map((m) =>
      m.attachment ? { ...m, attachment: { ...m.attachment, thumbnail: "" } } : m
    ),
  });

  try {
    attempt(conversations);
    return;
  } catch {
    // Quota exceeded: fall through and retry with less data.
  }
  try {
    attempt(conversations.map((c) => (c.id === keepId ? c : stripThumbs(c))));
    return;
  } catch {
    // Still too big.
  }
  try {
    attempt(conversations.map(stripThumbs));
  } catch (error) {
    console.error("Could not save chat history", error);
  }
}

export function renameConversation(id: string, title: string): void {
  if (!isBrowser()) return;
  const conversations = getConversations();
  const index = conversations.findIndex((c) => c.id === id);
  if (index < 0) return;
  // Keep updatedAt as-is so a rename doesn't jump the chat to the top.
  conversations[index] = {
    ...conversations[index],
    title: title.trim() || "New chat",
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function deleteConversation(id: string): void {
  if (!isBrowser()) return;
  const conversations = getConversations().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function createConversation(personaId: string): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    personaId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 50) return trimmed || "New chat";
  return `${trimmed.slice(0, 50).trim()}…`;
}

export function getLatestConversationForPersona(
  personaId: string
): Conversation | null {
  return (
    getConversations().find((c) => c.personaId === personaId) ?? null
  );
}
