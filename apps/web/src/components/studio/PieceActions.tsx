"use client";

import type { AssetNode } from "./assets-data";
import { ExpandIcon, TagIcon } from "./icons";
import { LABEL_MAX } from "./piece-detail";

/** Inspect's two actions over a piece: Details, and Label or Unlabel. */
export function PieceActions({
  node,
  label,
  full,
  onDetails,
  onLabel,
}: {
  node: AssetNode;
  /** the piece's label number, or -1 */
  label: number;
  /** no label left to give */
  full: boolean;
  onDetails: () => void;
  onLabel: () => void;
}) {
  return (
    <div
      className="glass stage-actions"
      role="group"
      aria-label={`${node.name} actions`}
    >
      <button type="button" className="stage-action" onClick={onDetails}>
        <ExpandIcon size={13} />
        Details
      </button>
      <button
        type="button"
        className="stage-action"
        aria-pressed={label >= 0}
        disabled={full}
        title={full ? `Up to ${LABEL_MAX} labels at a time` : undefined}
        onClick={onLabel}
      >
        <TagIcon size={13} />
        {label >= 0 ? "Unlabel" : "Label"}
      </button>
    </div>
  );
}
