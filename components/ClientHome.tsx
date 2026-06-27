"use client";

import dynamic from "next/dynamic";

const ChatApp = dynamic(() => import("@/components/ChatApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-blue-500" />
    </div>
  ),
});

export default function ClientHome() {
  return <ChatApp />;
}
