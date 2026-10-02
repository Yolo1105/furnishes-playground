"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_NAMES,
  pieceTotals,
  sgd,
  type AssetCategory,
  type AssetGroup,
  type AssetKind,
  type AssetNode,
} from "./assets-data";
import { ProductsTab } from "./ProductsTab";
import { products, useScene } from "./scene-store";
import {
  ChevronRightIcon,
  CubeIcon,
  EyeIcon,
  FilterIcon,
  LockIcon,
  SearchIcon,
} from "./icons";

type KindFilter = "all" | "piece" | "room";
type Tab = "assets" | "products";

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
  const [tab, setTab] = useState<Tab>("assets");
  const assetGroups = useScene((s) => s.groups);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AssetCategory | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const filterWrap = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const totals = useMemo(
    () => pieceTotals(assetGroups.flatMap((g) => g.items)),
    [assetGroups],
  );

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
    [assetGroups, category, kind, q],
  );
  const active =
    (category ? 1 : 0) + (tab === "assets" && kind !== "all" ? 1 : 0);
  const toggle = (id: string) => setClosed((c) => ({ ...c, [id]: !c[id] }));

  return (
    <div className="assets">
      <div className="shell-subbar">
        <div className="shell-tabs-inline" role="tablist" aria-label="Project">
          {(
            [
              ["assets", "Assets"],
              ["products", "Products"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="shell-tabbtn"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="assets-count f-num">
          {tab === "assets"
            ? `${totals.pieces} pieces · ${sgd(totals.total)}`
            : `${products.length} in the catalogue`}
        </span>
      </div>

      <div className="assets-search">
        <label className="assets-field">
          <SearchIcon />
          <input
            type="search"
            className="assets-input"
            placeholder={tab === "assets" ? "Search" : "Search the catalogue"}
            aria-label={tab === "assets" ? "Search assets" : "Search products"}
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
              {tab === "assets" && (
                <>
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
                    Furnishes pieces are the ones you can edit and buy. Room
                    items only set the scene.
                  </p>
                </>
              )}
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
          {tab === "assets" && kind !== "all" && (
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

      {tab === "products" && <ProductsTab query={query} category={category} />}
      <div
        className="assets-tree"
        role="tree"
        aria-label="Assets"
        hidden={tab !== "assets"}
      >
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
              g.items.map((n, i, arr) => (
                <Node
                  key={n.id}
                  node={n}
                  depth={1}
                  trail={[]}
                  last={i === arr.length - 1}
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
  trail,
  last,
  q,
  closed,
  onToggle,
}: {
  node: AssetNode;
  depth: number;
  /** for each ancestor level, whether its guide line continues past this row */
  trail: boolean[];
  last: boolean;
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
        trail={trail}
        last={last}
        onToggle={hasKids ? () => onToggle(n.id) : undefined}
      />
      {hasKids &&
        open &&
        kids.map((c, i) => (
          <Node
            key={c.id}
            node={c}
            depth={depth + 1}
            trail={[...trail, !last]}
            last={i === kids.length - 1}
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
  trail = [],
  last = true,
  onToggle,
}: {
  depth: number;
  name: string;
  kind: AssetKind | "group";
  price?: number | undefined;
  count?: number;
  open?: boolean;
  trail?: boolean[];
  last?: boolean;
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
      {/* the lines back to the parent: one per ancestor level, the own
          level ending in a tick, stopping halfway on the last child */}
      {Array.from({ length: depth }, (_, i) => {
        const own = i === depth - 1;
        const cont = own ? !last : (trail[i] ?? false);
        if (!own && !cont) return null;
        return (
          <span
            key={i}
            className="assets-guide"
            data-own={own}
            data-cont={cont}
            style={{ left: 11 + i * 18 }}
            aria-hidden="true"
          />
        );
      })}
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
      {kind !== "group" && (
        <span className="assets-mark" data-kind={kind} aria-hidden="true">
          {kind === "fixed" ? <LockIcon /> : <CubeIcon />}
        </span>
      )}
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
