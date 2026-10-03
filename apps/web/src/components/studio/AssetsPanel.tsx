"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_NAMES,
  sgd,
  type AssetCategory,
  type AssetGroup,
  type AssetKind,
  type AssetNode,
} from "./assets-data";
import { ProductsTab } from "./ProductsTab";
import { RoomTab } from "./RoomTab";
import { groupOf, useScene } from "./scene-store";
import { useDismiss } from "./useDismiss";
import {
  ChevronRightIcon,
  CubeIcon,
  EyeIcon,
  FilterIcon,
  LockIcon,
  SearchIcon,
} from "./icons";

type KindFilter = "all" | "piece" | "room";
type Tab = "assets" | "products" | "room";

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
  // the filter flies out to the right of the panel, past its clipped edge,
  // so it is placed from the button's spot on screen when opened
  const [filterAt, setFilterAt] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const filterOpen = filterAt !== null;
  const setFilterOpen = (open: boolean) => {
    const r = filterWrap.current?.getBoundingClientRect();
    setFilterAt(open && r ? { top: r.top - 8, left: r.right + 14 } : null);
  };
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const filterWrap = useRef<HTMLDivElement>(null);
  const tree = useRef<HTMLDivElement>(null);
  const selectedId = useScene((s) => s.selectedId);
  const revealAt = useScene((s) => s.revealAt);
  const select = useScene((s) => s.select);
  const q = query.trim().toLowerCase();

  // a pick on the shelf must be seen here: the Assets tab comes up, the
  // row's group and parent open, a filter hiding it is let go, and the
  // row scrolls into view. The filters are read as they are at the pick.
  const filters = useRef({ category, kind, q });
  useEffect(() => {
    filters.current = { category, kind, q };
  }, [category, kind, q]);
  useEffect(
    () =>
      useScene.subscribe((s, prev) => {
        if (s.revealAt === prev.revealAt || !s.selectedId) return;
        const id = s.selectedId;
        const g = groupOf(s.groups, id);
        const node =
          g?.items.find((n) => n.id === id) ??
          g?.items.find((n) => n.children?.some((c) => c.id === id));
        if (!g || !node) return;
        setTab("assets");
        setClosed((c) => ({ ...c, [g.id]: false, [node.id]: false }));
        const f = filters.current;
        const hidden =
          (f.category && f.category !== g.id) ||
          !keeps(node, f.kind) ||
          (f.q &&
            !matches(node, f.q) &&
            !node.children?.some((c) => matches(c, f.q)));
        if (hidden) {
          setQuery("");
          setCategory(null);
          setKind("all");
        }
      }),
    [],
  );
  useLayoutEffect(() => {
    if (!selectedId || tab !== "assets") return;
    tree.current
      ?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId, revealAt, tab, closed]);

  const filterMenu = useRef<HTMLDivElement>(null);
  useDismiss(filterWrap, filterOpen, () => setFilterOpen(false), filterMenu);

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
              ["room", "Room"],
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
      </div>

      {tab !== "room" && (
        <div className="assets-search">
          <label className="assets-field">
            <SearchIcon />
            <input
              type="search"
              className="assets-input"
              placeholder={tab === "assets" ? "Search" : "Search the catalogue"}
              aria-label={
                tab === "assets" ? "Search assets" : "Search products"
              }
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
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <FilterIcon />
              {active > 0 && <span className="assets-filter-n">{active}</span>}
            </button>
            {filterOpen && (
              <div
                className="shell-menu assets-filter-menu"
                role="dialog"
                aria-label="Filter"
                ref={filterMenu}
                style={filterAt}
              >
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
      )}

      {active > 0 && tab !== "room" && (
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
      {tab === "room" && <RoomTab />}
      <div
        ref={tree}
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
                  selectedId={selectedId}
                  onSelect={select}
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
  selectedId,
  onSelect,
}: {
  node: AssetNode;
  depth: number;
  /** for each ancestor level, whether its guide line continues past this row */
  trail: boolean[];
  last: boolean;
  q: string;
  closed: Record<string, boolean>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const kids = n.children?.filter((c) => !q || matches(c, q)) ?? [];
  const hasKids = (n.children?.length ?? 0) > 0;
  const open = !closed[n.id];
  return (
    <>
      <Row
        id={n.id}
        depth={depth}
        name={n.name}
        kind={n.kind}
        price={n.price}
        open={open}
        trail={trail}
        last={last}
        onToggle={hasKids ? () => onToggle(n.id) : undefined}
        selected={selectedId === n.id}
        onSelect={() => onSelect(n.id)}
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
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

function Row({
  id,
  depth,
  name,
  kind,
  price,
  count,
  open = false,
  trail = [],
  last = true,
  onToggle,
  selected = false,
  onSelect,
}: {
  id?: string;
  depth: number;
  name: string;
  kind: AssetKind | "group";
  price?: number | undefined;
  count?: number;
  open?: boolean;
  trail?: boolean[];
  last?: boolean;
  onToggle?: (() => void) | undefined;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <div
      className="assets-row"
      role="treeitem"
      aria-selected={selected}
      aria-label={kind === "group" ? undefined : name}
      data-kind={kind}
      data-leaf={!onToggle}
      data-id={id}
      aria-expanded={onToggle ? open : undefined}
      style={{ ["--depth" as string]: depth }}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
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
            style={{ ["--level" as string]: i }}
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
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        style={{ visibility: onToggle ? "visible" : "hidden" }}
      >
        <ChevronRightIcon open={open} />
      </button>
      {/* the part that reads as the thing: from the mark to the right
          edge; the pick and the hover tint this, not the guide lines */}
      <span className="assets-row-main">
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
            onClick={(e) => e.stopPropagation()}
          >
            <EyeIcon />
          </button>
        )}
      </span>
    </div>
  );
}
