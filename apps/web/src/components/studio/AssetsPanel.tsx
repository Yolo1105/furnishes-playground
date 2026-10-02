"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  assetGroups,
  CATEGORY_NAMES,
  pieceTotals,
  sgd,
  topLevelAssets,
  type AssetCategory,
  type AssetGroup,
  type AssetKind,
  type AssetNode,
} from "./assets-data";
import {
  ChevronRightIcon,
  CubeIcon,
  EyeIcon,
  FilterIcon,
  LockIcon,
  SearchIcon,
} from "./icons";

type KindFilter = "all" | "piece" | "room";

const matches = (n: AssetNode, q: string): boolean =>
  n.name.toLowerCase().includes(q) ||
  (n.children?.some((c) => matches(c, q)) ?? false);

const keeps = (n: AssetNode, kind: KindFilter) =>
  kind === "all" ||
  (kind === "piece" ? n.kind === "piece" : n.kind !== "piece");

/**
 * The outliner: everything in the room, grouped the way furniture relates
 * (storage, seating, tables…). A Furnishes piece carries the orange mark
 * and its price: that is what can be edited and bought. Room items read
 * muted; architecture is locked. Search narrows by name; the filter picks
 * a category and/or one of the two kinds.
 */
export function AssetsPanel() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AssetCategory | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const filterWrap = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const totals = useMemo(() => pieceTotals(topLevelAssets()), []);

  useEffect(() => {
    if (!filterOpen) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setFilterOpen(false);
    const onDown = (e: PointerEvent) => {
      if (filterWrap.current && !filterWrap.current.contains(e.target as Node))
        setFilterOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [filterOpen]);

  const shown: AssetGroup[] = useMemo(
    () =>
      assetGroups
        .filter((g) => !category || g.id === category)
        .map((g) => ({
          ...g,
          items: g.items.filter((n) => keeps(n, kind) && (!q || matches(n, q))),
        }))
        .filter((g) => g.items.length > 0),
    [category, kind, q],
  );
  const active = (category ? 1 : 0) + (kind !== "all" ? 1 : 0);
  const toggle = (id: string) => setClosed((c) => ({ ...c, [id]: !c[id] }));

  return (
    <div className="assets">
      <div className="shell-subbar">
        <div className="shell-tabs-inline" role="tablist" aria-label="Project">
          <button
            type="button"
            role="tab"
            className="shell-tabbtn"
            aria-selected="true"
          >
            Assets
          </button>
        </div>
        <span className="assets-count f-num">
          {totals.pieces} pieces · {sgd(totals.total)}
        </span>
      </div>

      <div className="assets-search">
        <label className="assets-field">
          <SearchIcon />
          <input
            type="search"
            className="assets-input"
            placeholder="Search"
            aria-label="Search assets"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div ref={filterWrap} className="assets-filter">
          <button
            type="button"
            className="shell-iconbtn shell-tip"
            data-tooltip="Filter"
            aria-label="Filter assets"
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            aria-pressed={active > 0}
            onClick={() => setFilterOpen((v) => !v)}
          >
            <FilterIcon />
            {active > 0 && <span className="assets-filter-n">{active}</span>}
          </button>
          {filterOpen && (
            <div className="shell-menu assets-filter-menu" role="dialog">
              <p className="assets-filter-label">Show</p>
              <div className="assets-kinds">
                {(
                  [
                    ["all", "Everything"],
                    ["piece", "Furnishes pieces"],
                    ["room", "Room items"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className="assets-chip"
                    aria-pressed={kind === id}
                    onClick={() => setKind(id)}
                  >
                    {id === "piece" && <span className="assets-dot" />}
                    {label}
                  </button>
                ))}
              </div>
              <p className="assets-filter-hint">
                Furnishes pieces are the ones you can edit and buy. Room items
                only set the scene.
              </p>
              <p className="assets-filter-label">Category</p>
              <div className="assets-kinds">
                <button
                  type="button"
                  className="assets-chip"
                  aria-pressed={category === null}
                  onClick={() => setCategory(null)}
                >
                  All
                </button>
                {(Object.keys(CATEGORY_NAMES) as AssetCategory[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="assets-chip"
                    aria-pressed={category === c}
                    onClick={() => setCategory(category === c ? null : c)}
                  >
                    {CATEGORY_NAMES[c]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {active > 0 && (
        <div className="assets-active">
          {kind !== "all" && (
            <button
              type="button"
              className="assets-chip assets-chip-x"
              onClick={() => setKind("all")}
            >
              {kind === "piece" ? "Furnishes pieces" : "Room items"} ×
            </button>
          )}
          {category && (
            <button
              type="button"
              className="assets-chip assets-chip-x"
              onClick={() => setCategory(null)}
            >
              {CATEGORY_NAMES[category]} ×
            </button>
          )}
        </div>
      )}

      <div className="assets-tree" role="tree" aria-label="Assets">
        {shown.length === 0 && (
          <p className="assets-empty">Nothing here matches.</p>
        )}
        {shown.map((g) => (
          <div key={g.id} role="group" className="assets-group">
            <Row
              depth={0}
              name={g.name}
              kind="group"
              open={!closed[g.id]}
              onToggle={() => toggle(g.id)}
              count={g.items.length}
            />
            {!closed[g.id] &&
              g.items.map((n) => (
                <Node
                  key={n.id}
                  node={n}
                  depth={1}
                  q={q}
                  closed={closed}
                  onToggle={toggle}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({
  node: n,
  depth,
  q,
  closed,
  onToggle,
}: {
  node: AssetNode;
  depth: number;
  q: string;
  closed: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const kids = n.children?.filter((c) => !q || matches(c, q)) ?? [];
  const hasKids = (n.children?.length ?? 0) > 0;
  const open = !closed[n.id];
  return (
    <>
      <Row
        depth={depth}
        name={n.name}
        kind={n.kind}
        price={n.price}
        open={open}
        onToggle={hasKids ? () => onToggle(n.id) : undefined}
      />
      {hasKids &&
        open &&
        kids.map((c) => (
          <Node
            key={c.id}
            node={c}
            depth={depth + 1}
            q={q}
            closed={closed}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

function Row({
  depth,
  name,
  kind,
  price,
  count,
  open = false,
  onToggle,
}: {
  depth: number;
  name: string;
  kind: AssetKind | "group";
  price?: number | undefined;
  count?: number;
  open?: boolean;
  onToggle?: (() => void) | undefined;
}) {
  return (
    <div
      className="assets-row"
      role="treeitem"
      aria-selected={false}
      data-kind={kind}
      aria-expanded={onToggle ? open : undefined}
      style={{ ["--depth" as string]: depth }}
    >
      <button
        type="button"
        className="assets-twisty"
        aria-label={onToggle ? (open ? "Collapse" : "Expand") : undefined}
        aria-hidden={!onToggle}
        tabIndex={onToggle ? 0 : -1}
        onClick={onToggle}
        style={{ visibility: onToggle ? "visible" : "hidden" }}
      >
        <ChevronRightIcon open={open} />
      </button>
      <span className="assets-mark" aria-hidden="true">
        {kind === "piece" ? (
          <span className="assets-dot" />
        ) : kind === "fixed" ? (
          <LockIcon />
        ) : kind === "group" ? null : (
          <CubeIcon />
        )}
      </span>
      <span className="assets-name">{name}</span>
      {kind === "group" && count !== undefined && (
        <span className="assets-n f-num">{count}</span>
      )}
      {price !== undefined && (
        <span className="assets-price f-num">{sgd(price)}</span>
      )}
      {kind !== "group" && (
        <button
          type="button"
          className="assets-eye"
          aria-label={`Hide ${name}`}
          tabIndex={-1}
        >
          <EyeIcon />
        </button>
      )}
    </div>
  );
}
