"use client";

import { useEffect, useMemo } from "react";
import type { AssetNode } from "./assets-data";
import { buildPartMesh, usePartStore } from "./part-client";
import { useScene } from "./scene-store";

/**
 * The parts in the room kept built: one watcher a part item, which
 * asks the part worker for a build whenever the part's history or its
 * rollback marker changes, a short wait after the last change so a
 * value being typed is built once. The result goes into the part
 * store, where the stage, the plan and the timeline read it, and the
 * item's size follows the body's box, so clashes and the plan symbol
 * are the part's own.
 */
/** ms after the last change before a build is asked for */
export const BUILD_AFTER = 150;

export function PartBuilder() {
  const groups = useScene((s) => s.groups);
  const upTo = usePartStore((s) => s.upTo);
  const parts = useMemo(
    () => groups.flatMap((g) => g.items).filter((n) => n.part),
    [groups],
  );
  return (
    <>
      {parts.map((n) => (
        <One key={n.id} node={n} upTo={upTo[n.id]} />
      ))}
    </>
  );
}

function One({ node, upTo }: { node: AssetNode; upTo: number | undefined }) {
  const part = node.part!;
  const key = JSON.stringify([part, upTo]);
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      buildPartMesh(part, upTo)
        .then((r) => {
          if (!live) return;
          usePartStore.getState().setBuilt(node.id, { key, ...r });
          if (r.mesh) {
            const [lo, hi] = r.mesh.bounds;
            useScene.getState().sizePart(node.id, {
              width: Math.max(1, Math.round(hi[0] - lo[0])),
              depth: Math.max(1, Math.round(hi[1] - lo[1])),
              height: Math.max(1, Math.round(hi[2] - lo[2])),
            });
          }
        })
        .catch((error: unknown) => {
          if (!live) return;
          usePartStore.getState().setBuilt(node.id, {
            key,
            mesh: null,
            statuses: part.features.map((f) => ({
              id: f.id,
              state: "failed",
              message: error instanceof Error ? error.message : String(error),
            })),
            ms: 0,
          });
        });
    }, BUILD_AFTER);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // the key says everything the build depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, node.id]);
  // the item gone: its build goes too
  useEffect(
    () => () => usePartStore.getState().setBuilt(node.id, null),
    [node.id],
  );
  return null;
}
