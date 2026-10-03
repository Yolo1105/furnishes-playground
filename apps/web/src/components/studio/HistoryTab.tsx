"use client";

import { useEffect, useRef, useState } from "react";
import { dayLabel, timeLabel, type Conversation } from "./eva-data";
import { useEva } from "./eva-store";
import { MessageIcon, PencilIcon, TrashIcon } from "./icons";

/**
 * Past conversations, newest first, under the day they were last touched.
 * A row is the playground's: title, the last line, how many turns. The
 * open one sits in orange. Hover shows rename and delete; double-click
 * renames, as the archive did. No input box here: this tab is for
 * finding a conversation, not continuing one.
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
                <span className="eva-conv-acts">
                  <button
                    type="button"
                    className="shell-iconbtn"
                    aria-label={`Rename ${c.title}`}
                    onClick={() => setEditing({ id: c.id, draft: c.title })}
                  >
                    <PencilIcon size={14} />
                  </button>
                  <button
                    type="button"
                    className="shell-iconbtn"
                    aria-label={`Delete ${c.title}`}
                    onClick={() => remove(c.id)}
                  >
                    <TrashIcon size={14} />
                  </button>
                </span>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
