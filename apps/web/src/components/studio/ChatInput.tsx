"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PROMPTS } from "./eva-data";
import {
  ChevronDownIcon,
  ImageIcon,
  LightbulbIcon,
  MicIcon,
  SendArrowIcon,
} from "./icons";
import { useEva } from "./eva-store";
import { RadioMenu } from "./RadioMenu";
import { useDismiss } from "./useDismiss";

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
 * Enter or the arrow sends; the bulb shows prompts to pick from; the
 * picture button attaches one; the mic dictates where the browser can.
 */
type Recognizer = {
  lang: string;
  interimResults: boolean;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const recognizerOf = (): (new () => Recognizer) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognizer;
    webkitSpeechRecognition?: new () => Recognizer;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
/* the browser's support is read after hydration: the server, which has
   none, and the client must render the same mic */
const noop = () => () => {};
const useRecognizer = () =>
  useSyncExternalStore(noop, recognizerOf, () => null);
export function ChatInput() {
  const [message, setMessage] = useState("");
  const [focused, setFocused] = useState(false);
  const [mode, setMode] = useState<Mode>("Ask");
  const [menu, setMenu] = useState(false);
  const [suggestions, setSuggestions] = useState(false);
  const [placeholder, setPlaceholder] = useState(0);
  const [dim, setDim] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const recognizer = useRef<Recognizer | null>(null);
  const Speech = useRecognizer();
  const send = useEva((s) => s.send);
  const canSend = message.trim().length > 0 || image !== null;
  const submit = () => {
    if (!canSend) return;
    send(message, image ?? undefined);
    setMessage("");
    setImage(null);
    setSuggestions(false);
  };
  const dictate = () => {
    if (!Speech) return;
    if (recognizer.current) {
      recognizer.current.stop();
      return;
    }
    const r = new Speech();
    r.lang = "en-SG";
    r.interimResults = false;
    r.onresult = (e) => {
      const said = Array.from(e.results)
        .map((x) => x[0]?.transcript ?? "")
        .join(" ");
      setMessage((m) => (m ? `${m} ${said}` : said));
    };
    r.onend = () => {
      recognizer.current = null;
      setListening(false);
    };
    recognizer.current = r;
    setListening(true);
    r.start();
  };

  // a prompt picked in the Agent tab lands here, ready to send or edit
  useEffect(
    () =>
      useEva.subscribe((s, prev) => {
        if (s.draft && s.draft !== prev.draft) {
          setMessage(s.draft);
          area.current?.focus();
          useEva.getState().setDraft("");
        }
      }),
    [],
  );

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
    let fade = 0;
    const id = window.setInterval(() => {
      setDim(true);
      fade = window.setTimeout(() => {
        setPlaceholder((i) => (i + 1) % PLACEHOLDERS.length);
        setDim(false);
      }, 200);
    }, 4000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(fade);
    };
  }, [focused, message.length]);

  useDismiss(wrap, menu, () => setMenu(false));

  return (
    <div className="glass chat-input" data-focused={focused}>
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
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        style={{ opacity: !focused && !message && dim ? 0.3 : 1 }}
      />
      {suggestions && (
        <div className="chat-suggest" role="group" aria-label="Suggestions">
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              className="assets-chip"
              onClick={() => {
                setMessage(p);
                setSuggestions(false);
                area.current?.focus();
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {image && (
        <div className="chat-attach">
          <ImageIcon size={13} />
          <span className="chat-attach-name">{image}</span>
          <button
            type="button"
            className="eva-own-x"
            aria-label="Remove picture"
            onClick={() => setImage(null)}
          >
            ×
          </button>
        </div>
      )}
      <div className="chat-input-bar">
        <div className="chat-input-left">
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setImage(f.name);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="shell-iconbtn"
            aria-label="Add a picture"
            aria-pressed={image !== null}
            onClick={() => file.current?.click()}
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
              <RadioMenu
                className="chat-mode-menu"
                options={MODES}
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setMenu(false);
                }}
              />
            )}
          </div>
          <button
            type="button"
            className="chat-eva"
            aria-label="Write to Eva"
            onClick={() => area.current?.focus()}
          >
            <span className="chat-eva-dot" aria-hidden="true" />
            Eva
          </button>
          <button
            type="button"
            className="chat-send"
            data-ready={canSend}
            data-listening={listening}
            aria-label={
              canSend ? "Send" : listening ? "Stop listening" : "Voice input"
            }
            aria-pressed={canSend ? undefined : listening}
            disabled={!canSend && !Speech}
            title={
              !canSend && !Speech
                ? "Voice input is not available in this browser"
                : undefined
            }
            onClick={() => (canSend ? submit() : dictate())}
          >
            {canSend ? <SendArrowIcon /> : <MicIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}
