"use client";

import { useEffect, useRef, useState } from "react";
import { dayLabel, timeLabel, type Conversation } from "./eva-data";
import { useEva } from "./eva-store";
import { MessageIcon, MoreIcon, PencilIcon, TrashIcon } from "./icons";
import { useDismiss } from "./useDismiss";

/**
 * Past conversations, newest first, under the day they were last touched.
 * A row is the playground's: title, the last line, how many turns. The
 * open one sits in orange; a click on a row opens it. Hover shows a
 * three-dot button whose menu renames or deletes the row; double-click
 * renames too. No input box here: this tab is for finding a
 * conversation, not continuing one.
 */
export function HistoryTab({ onOpen }: { onOpen?: () => void }) {
  const conversations = useEva((s) => s.conversations);
  const activeId = useEva((s) => s.activeId);
  const select = useEva((s) => s.selectConversation);
  const remove = useEva((s) => s.deleteConversation);
  const rename = useEva((s) => s.renameConversation);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(
    null,
  );
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuWrap = useRef<HTMLSpanElement>(null);
  useDismiss(menuWrap, menuFor !== null, () => setMenuFor(null));

  const sorted = [...conversations].sort((a, b) => b.at - a.at);
  const groups: { label: string; rows: Conversation[] }[] = [];
  for (const c of sorted) {
    const label = dayLabel(c.at);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.rows.push(c);
    else groups.push({ label, rows: [c] });
  }
  const commit = () => {
    if (!editing) return;
    const t = editing.draft.trim();
    if (t) rename(editing.id, t);
    setEditing(null);
  };

  if (sorted.length === 0)
    return (
      <p className="eva-empty">No conversations yet. Press + to start one.</p>
    );

  return (
    <div className="eva-history">
      {groups.map((g) => (
        <section key={g.label} className="eva-day">
          <p className="eva-day-label">{g.label}</p>
          {g.rows.map((c) => {
            const active = c.id === activeId;
            const isEditing = editing?.id === c.id;
            return (
              <div key={c.id} className="eva-conv" data-active={active}>
                {isEditing ? (
                  <input
                    ref={input}
                    className="eva-conv-rename"
                    value={editing.draft}
                    aria-label="Conversation title"
                    onChange={(e) =>
                      setEditing({ id: c.id, draft: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    onBlur={commit}
                  />
                ) : (
                  <button
                    type="button"
                    className="eva-conv-open"
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      select(c.id);
                      onOpen?.();
                    }}
                    onDoubleClick={() =>
                      setEditing({ id: c.id, draft: c.title })
                    }
                  >
                    <span className="eva-conv-title">
                      <MessageIcon size={13} />
                      {c.title}
                    </span>
                    <span className="eva-conv-snippet">{c.snippet}</span>
                    <span className="eva-conv-meta f-num">
                      {timeLabel(c.at)} · {c.turns} turns
                    </span>
                  </button>
                )}
                <span
                  className="eva-conv-acts"
                  ref={menuFor === c.id ? menuWrap : undefined}
                  data-open={menuFor === c.id}
                >
                  <button
                    type="button"
                    className="shell-iconbtn"
                    aria-label={`More for ${c.title}`}
                    aria-haspopup="menu"
                    aria-expanded={menuFor === c.id}
                    onClick={() =>
                      setMenuFor((cur) => (cur === c.id ? null : c.id))
                    }
                  >
                    <MoreIcon size={14} />
                  </button>
                  {menuFor === c.id && (
                    <div
                      className="shell-menu eva-conv-menu"
                      role="menu"
                      aria-label={`${c.title} actions`}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="shell-menu-row"
                        onClick={() => {
                          setMenuFor(null);
                          setEditing({ id: c.id, draft: c.title });
                        }}
                      >
                        <PencilIcon /> Rename
                      </button>
                      <div className="shell-menu-sep" role="separator" />
                      <button
                        type="button"
                        role="menuitem"
                        className="shell-menu-row"
                        onClick={() => {
                          setMenuFor(null);
                          remove(c.id);
                        }}
                      >
                        <TrashIcon /> Delete
                      </button>
                    </div>
                  )}
                </span>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
