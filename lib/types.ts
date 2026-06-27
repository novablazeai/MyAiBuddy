export type LangMode = "auto" | "cantonese" | "english";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  personaId: string;
}

export interface Conversation {
  id: string;
  title: string;
  personaId: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
