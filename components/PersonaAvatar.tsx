"use client";

import Image from "next/image";
import { useState } from "react";
import type { Persona } from "@/lib/personas";

interface PersonaAvatarProps {
  persona: Persona;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { px: 32, text: "text-sm" },
  md: { px: 40, text: "text-base" },
  lg: { px: 56, text: "text-xl" },
};

export default function PersonaAvatar({
  persona,
  size = "md",
  className = "",
}: PersonaAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const { px, text } = sizeMap[size];

  if (imageError) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full font-serif font-semibold text-white shadow-md ${text} ${className}`}
        style={{
          width: px,
          height: px,
          background: `linear-gradient(135deg, ${persona.accentHex}, ${persona.accentHex}cc)`,
        }}
        aria-hidden
      >
        {persona.name.charAt(0)}
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full shadow-md ${className}`}
      style={{ width: px, height: px }}
    >
      <Image
        src={persona.avatar}
        alt={persona.name}
        width={px}
        height={px}
        className="h-full w-full object-cover"
        onError={() => setImageError(true)}
      />
    </div>
  );
}
