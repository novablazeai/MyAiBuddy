"use client";

import { personas, type Persona } from "@/lib/personas";
import PersonaAvatar from "./PersonaAvatar";

interface PersonaSwitcherProps {
  activePersonaId: string;
  onSwitch: (personaId: string) => void;
}

export default function PersonaSwitcher({
  activePersonaId,
  onSwitch,
}: PersonaSwitcherProps) {
  // With a single persona the switcher is redundant — the header already
  // shows who you're talking to.
  if (personas.length <= 1) return null;

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3">
      {personas.map((persona) => {
        const isActive = persona.id === activePersonaId;
        return (
          <button
            key={persona.id}
            type="button"
            onClick={() => onSwitch(persona.id)}
            className={`flex shrink-0 items-center gap-2.5 rounded-full border px-3 py-2 transition-all ${
              isActive
                ? "border-white/80 bg-white/90 shadow-md"
                : "border-white/40 bg-white/50 hover:bg-white/70"
            }`}
            style={
              isActive
                ? { boxShadow: `0 0 0 2px ${persona.accentHex}40` }
                : undefined
            }
          >
            <PersonaAvatar persona={persona} size="sm" />
            <div className="text-left">
              <p
                className="font-serif text-sm font-semibold leading-tight"
                style={{ color: isActive ? persona.accentHex : "#475569" }}
              >
                {persona.name}
              </p>
              <p className="text-[11px] leading-tight text-slate-500">
                {persona.tagline}
              </p>
            </div>
            {isActive && (
              <div
                className="ml-1 h-1 w-6 rounded-full"
                style={{ backgroundColor: persona.accentHex }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export type { Persona };
