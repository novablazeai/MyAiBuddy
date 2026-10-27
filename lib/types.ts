export type LangMode = "auto" | "cantonese" | "english";

/** A photo attached to a user message, as kept on-device in chat history. */
export interface ImageAttachment {
  kind: "image";
  /** Small JPEG data URL, shown as the preview in chat history. */
  thumbnail: string;
  /**
   * One-line description of the photo. The full photo is sent to the model
   * only once; on later turns this note stands in for it (cheaper).
   */
  note?: string;
}

/** A photo prepared in the browser, ready to send to the model once. */
export interface PreparedImage {
  /** Base64 JPEG data (no data: prefix). */
  data: string;
  mimeType: "image/jpeg";
  /** Small JPEG data URL for the chat history preview. */
  thumbnail: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  personaId: string;
  attachment?: ImageAttachment;
}

export interface Conversation {
  id: string;
  title: string;
  personaId: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
