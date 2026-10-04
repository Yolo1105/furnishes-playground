"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Floating } from "./Floating";
import { CloseIcon } from "./icons";

/**
 * A modal card in the middle of the screen over a scrim: a title, its
 * body, and a close in the corner. Escape and a press on the scrim close
 * it; focus goes to the card as it opens.
 */
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Floating>
      <div className="shell-dialog" data-wide={wide}>
        <div className="shell-dialog-scrim" onPointerDown={onClose} />
        <section
          ref={card}
          className="glass shell-dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={id}
          tabIndex={-1}
        >
          <header className="shell-dialog-head">
            <h2 className="shell-dialog-title" id={id}>
              {title}
            </h2>
            <button
              type="button"
              className="shell-iconbtn"
              aria-label="Close"
              onClick={onClose}
            >
              <CloseIcon size={14} />
            </button>
          </header>
          <div className="shell-dialog-body">{children}</div>
        </section>
      </div>
    </Floating>
  );
}
