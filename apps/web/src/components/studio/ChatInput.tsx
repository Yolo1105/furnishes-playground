"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ImageIcon,
  LightbulbIcon,
  MicIcon,
  SendArrowIcon,
} from "./icons";

/** The playground's modes, as the dropdown lists them. */
const MODES = ["Ask", "Furniture", "Room layout"] as const;
type Mode = (typeof MODES)[number];

const PLACEHOLDERS = [
  "Describe the space you're working on…",
  "What's the vibe? Mid-century, minimalist, biophilic…",
  "Try: a 4×5m bedroom with a reading nook by the window",
  "How should it feel — calm, social, focused, playful?",
  "Tell me about the light. North-facing? Sunset glow?",
  "What's the room used for, and who lives there?",
];

/**
 * The frosted input box at the bottom of Eva's panel, the playground's
 * design: a growing textarea; below it image and suggestions buttons on
 * the left, the mode dropdown, the Eva chip and the send / mic button on
 * the right. The border lights orange while anything inside has focus.
 * Nothing is sent yet: this is the surface, not the wiring.
 */
export function ChatInput() {
  const [message, setMessage] = useState("");
  const [focused, setFocused] = useState(false);
  const [mode, setMode] = useState<Mode>("Ask");
  const [menu, setMenu] = useState(false);
  const [suggestions, setSuggestions] = useState(false);
  const [placeholder, setPlaceholder] = useState(0);
  const [dim, setDim] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canSend = message.trim().length > 0;

  // grow with the text, up to a cap
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [message]);

  // rotate the placeholder while the box is empty and unfocused
  useEffect(() => {
    if (focused || message.length > 0) return;
    const id = window.setInterval(() => {
      setDim(true);
      window.setTimeout(() => {
        setPlaceholder((i) => (i + 1) % PLACEHOLDERS.length);
        setDim(false);
      }, 200);
    }, 4000);
    return () => window.clearInterval(id);
  }, [focused, message.length]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node))
        setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [menu]);

  return (
    <div className="chat-input" data-focused={focused}>
      <textarea
        ref={area}
        className="chat-textarea"
        rows={1}
        value={message}
        placeholder={PLACEHOLDERS[placeholder]}
        aria-label="Message Eva"
        onChange={(e) => setMessage(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
        }}
        style={{ opacity: !focused && !message && dim ? 0.3 : 1 }}
      />
      <div className="chat-input-bar">
        <div className="chat-input-left">
          <button
            type="button"
            className="shell-iconbtn"
            aria-label="Upload image"
          >
            <ImageIcon />
          </button>
          <button
            type="button"
            className="shell-iconbtn"
            aria-pressed={suggestions}
            aria-label={suggestions ? "Hide suggestions" : "Show suggestions"}
            onClick={() => setSuggestions((v) => !v)}
          >
            <LightbulbIcon />
          </button>
        </div>
        <div className="chat-input-right">
          <div ref={wrap} className="chat-mode">
            <button
              type="button"
              className="chat-mode-btn"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            >
              <span>{mode}</span>
              <span className="chat-mode-sub">· Chat</span>
              <span className="chat-mode-caret">
                <ChevronDownIcon rotated={menu} />
              </span>
            </button>
            {menu && (
              <div className="shell-menu chat-mode-menu" role="menu">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="menuitemradio"
                    aria-checked={m === mode}
                    className="shell-menu-row"
                    onClick={() => {
                      setMode(m);
                      setMenu(false);
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="chat-eva" aria-label="Open Eva">
            <span className="chat-eva-dot" aria-hidden="true" />
            Eva
          </button>
          <button
            type="button"
            className="chat-send"
            data-ready={canSend}
            aria-label={canSend ? "Send" : "Voice input"}
          >
            {canSend ? <SendArrowIcon /> : <MicIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}
