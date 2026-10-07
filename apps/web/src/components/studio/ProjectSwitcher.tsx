"use client";

import { useEffect, useRef, useState } from "react";
import { SITE } from "@/lib/site";
import { ChevronDownIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { useProjects } from "./project-store";
import { useDismiss } from "./useDismiss";

/**
 * "Furnishes / First project" at the head of the project panel: the
 * name opens a menu of every project (the open one marked), with New
 * project, Rename and Delete below. Renaming happens in place; the last
 * project cannot be deleted. Switching keeps the open project first.
 */
export function ProjectSwitcher() {
  const projects = useProjects((s) => s.projects);
  const activeId = useProjects((s) => s.activeId);
  const { open, create, rename, remove } = useProjects.getState();
  const [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useDismiss(wrap, menu, () => setMenu(false));
  useEffect(() => {
    if (draft !== null) input.current?.select();
  }, [draft]);
  const active = projects.find((p) => p.id === activeId) ?? projects[0]!;
  const commit = () => {
    if (draft !== null) rename(active.id, draft);
    setDraft(null);
  };
  const pick = (go: () => void) => {
    setMenu(false);
    go();
  };
  return (
    <div ref={wrap} className="shell-project">
      <span className="shell-project-brand">{SITE.name}</span>
      <span className="shell-project-sep" aria-hidden="true">
        /
      </span>
      {draft !== null ? (
        <input
          ref={input}
          className="shell-project-rename"
          value={draft}
          aria-label="Project name"
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
          }}
          onBlur={commit}
        />
      ) : (
        <button
          type="button"
          className="shell-project-btn"
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={`Project, ${active.name}`}
          onClick={() => setMenu((v) => !v)}
          onDoubleClick={() => {
            setMenu(false);
            setDraft(active.name);
          }}
        >
          <span className="shell-project-name">{active.name}</span>
          <span className="shell-project-caret">
            <ChevronDownIcon />
          </span>
        </button>
      )}
      {menu && (
        <div className="shell-menu shell-project-menu" role="menu">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={p.id === active.id}
              className="shell-menu-row"
              onClick={() => pick(() => open(p.id))}
            >
              {p.name}
            </button>
          ))}
          <div className="shell-menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="shell-menu-row"
            onClick={() => pick(create)}
          >
            <PlusIcon /> New project
          </button>
          <button
            type="button"
            role="menuitem"
            className="shell-menu-row"
            onClick={() => pick(() => setDraft(active.name))}
          >
            <PencilIcon /> Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="shell-menu-row"
            disabled={projects.length <= 1}
            title={projects.length <= 1 ? "The last project stays" : undefined}
            onClick={() => pick(() => remove(active.id))}
          >
            <TrashIcon /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
