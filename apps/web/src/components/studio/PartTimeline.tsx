"use client";

import { useRef, useState } from "react";
import {
  featureSummary,
  moveFeature,
  removeFeature,
  updateFeature,
} from "@furnishes/domain";
import { stateWords } from "./PartTab";
import { usePartStore } from "./part-client";
import { findNode, useScene } from "./scene-store";
import { useDismiss } from "./useDismiss";

/**
 * The timeline: the picked part's history as a strip of chips on the
 * shelf, in order, each coloured by its state from the last build. A
 * click opens the feature in the Detail tab; a drag moves it earlier
 * or later; a right-click (or the chip's menu) suppresses or deletes
 * it; the thin marker between chips is the rollback: the history is
 * built up to it, as Fusion rolls its timeline back.
 */
export function PartTimeline() {
  const groups = useScene((s) => s.groups);
  const selectedId = useScene((s) => s.selectedId);
  const built = usePartStore((s) => (selectedId ? s.built[selectedId] : null));
  const upTo = usePartStore((s) =>
    selectedId ? s.upTo[selectedId] : undefined,
  );
  const editing = usePartStore((s) => s.editing);
  const [menu, setMenu] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, menu !== null, () => setMenu(null));
  const node = findNode(groups, selectedId)?.node;
  if (!node?.part) return null;
  const part = node.part;
  const { setEditing, setUpTo } = usePartStore.getState();
  const change = (next: typeof part) =>
    useScene.getState().setPart(node.id, next);
  const end = part.features.length;
  const marker = (at: number) => (
    <button
      key={`m${at}`}
      type="button"
      className="part-marker"
      aria-label={
        at === end
          ? "Build the whole history"
          : `Roll back to before ${part.features[at]!.name ?? featureSummary(part.features[at]!)}`
      }
      aria-pressed={(upTo ?? end) === at}
      onClick={() => setUpTo(node.id, at === end ? undefined : at)}
      onDragOver={(e) => {
        if (dragging) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (!dragging) return;
        const from = part.features.findIndex((f) => f.id === dragging);
        change(moveFeature(part, dragging, at > from ? at - 1 : at));
        setDragging(null);
      }}
    />
  );
  return (
    <div
      className="part-timeline"
      role="toolbar"
      aria-label={`${node.name} history`}
      data-rolled={upTo !== undefined}
    >
      <span className="part-timeline-name">{node.name}</span>
      {part.features.map((f, i) => {
        const st = built?.statuses.find((s) => s.id === f.id);
        const name = f.name ?? featureSummary(f);
        return [
          marker(i),
          <span key={f.id} className="part-chip-wrap">
            <button
              type="button"
              className="part-chip"
              draggable
              aria-pressed={editing?.id === node.id && editing.feature === f.id}
              data-state={st?.state ?? "building"}
              data-rolled={upTo !== undefined && i >= upTo}
              title={`${name}: ${stateWords(st)}`}
              onClick={() => setEditing({ id: node.id, feature: f.id })}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(f.id);
              }}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", f.id);
                setDragging(f.id);
              }}
              onDragEnd={() => setDragging(null)}
            >
              <span className="part-state" aria-hidden="true" />
              {name}
            </button>
            {menu === f.id && (
              <div
                ref={menuRef}
                className="shell-menu part-chip-menu"
                role="menu"
                aria-label={`${name} actions`}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="shell-menu-row"
                  onClick={() => {
                    setMenu(null);
                    change(
                      updateFeature(part, f.id, { suppressed: !f.suppressed }),
                    );
                  }}
                >
                  {f.suppressed ? "Unsuppress" : "Suppress"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="shell-menu-row"
                  onClick={() => {
                    setMenu(null);
                    setEditing({ id: node.id, feature: f.id });
                  }}
                >
                  Edit
                </button>
                <div className="shell-menu-sep" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="shell-menu-row"
                  onClick={() => {
                    setMenu(null);
                    change(removeFeature(part, f.id));
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </span>,
        ];
      })}
      {marker(end)}
    </div>
  );
}
