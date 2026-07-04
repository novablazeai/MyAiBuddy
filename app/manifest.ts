import type { MetadataRoute } from "next";

// Makes the app installable to the home screen (standalone, full-screen) on
// Android/Chrome and improves the iOS "Add to Home Screen" experience.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyAIBuddy",
    short_name: "MyAIBuddy",
    description:
      "Your personal AI companion — warm, witty, and always in your corner.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef2ff",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
