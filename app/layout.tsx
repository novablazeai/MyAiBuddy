import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyAIBuddy",
  description: "Your personal AI companion — warm, witty, and always in your corner.",
  // Opens in standalone (app-like) mode when added to the iOS home screen.
  appleWebApp: {
    capable: true,
    title: "MyAIBuddy",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${inter.variable} ${playfair.variable} h-full font-sans antialiased`}
      >
        <div className="flex h-full flex-col">{children}</div>
      </body>
    </html>
  );
}
