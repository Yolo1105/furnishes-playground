"use client";

import { useState } from "react";
import {
  type Axis3,
  featureSummary,
  type FeatureStatus,
  type FinderRule,
  finderSummary,
  freshPartId,
  moveFeature,
  type Part,
  type PartFeature,
  type PlaneName,
  rectangleSketch,
  removeFeature,
  removeSketch,
  updateFeature,
  updateSketch,
} from "@furnishes/domain";
import type { AssetNode } from "./assets-data";
import { download } from "./export";
import { PlusIcon, TrashIcon } from "./icons";
import { partStepOf, usePartStore } from "./part-client";
import { rulesOfFace } from "./Part3D";
import { useScene } from "./scene-store";
import { SketchEditor } from "./SketchEditor";

/**
 * The part editor in the Detail tab: the part's sketches, each on its
 * plane and editable in the sketcher, and its history of features in
 * order, each with its state from the last build (built, failed with
 * the kernel's words, suppressed, not built) and a form of typed
 * millimetres. A fillet or a chamfer names its edges by a rule; Pick
 * a face turns the next click on the part in 3D into one, and the
 * face's other readings can be chosen instead. The timeline strip on
 * the shelf (PartTimeline.tsx) shows the same history and shares the
 * feature in hand.
 */
const PLANES: PlaneName[] = ["XY", "XZ", "YZ"];
const AXES: Axis3[] = ["x", "y", "z"];

/** the words of a feature's state */
export const stateWords = (s: FeatureStatus | undefined) =>
  !s
    ? "building"
    : s.state === "ok"
      ? "built"
      : s.state === "failed"
        ? `failed: ${s.message ?? "unknown"}`
        : s.state === "suppressed"
          ? "suppressed"
          : "not built";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** a new feature of a kind, on the part's first sketch where one is
    needed, with plain values to type over */
export const newFeature = (
  part: Part,
  kind: PartFeature["kind"],
): PartFeature => {
  const id = freshPartId(part, "f");
  const sketch = part.sketches[0]?.id ?? "";
  switch (kind) {
    case "extrude":
      return {
        id,
        kind,
        sketch,
        distance: 18,
        direction: "one",
        op: part.features.length ? "join" : "new",
      };
    case "revolve":
      return {
        id,
        kind,
        sketch,
        axis: "y",
        angle: 360,
        op: part.features.length ? "join" : "new",
      };
    case "fillet":
      return { id, kind, edges: { rules: [] }, radius: 3 };
    case "chamfer":
      return { id, kind, edges: { rules: [] }, distance: 2 };
    case "mirror":
      return { id, kind, plane: "YZ", at: 0 };
    case "pattern":
      return { id, kind, mode: "linear", axis: "x", count: 2, spacing: 100 };
  }
};

export function PartTab({ node }: { node: AssetNode }) {
  const part = node.part!;
  const built = usePartStore((s) => s.built[node.id]);
  const upTo = usePartStore((s) => s.upTo[node.id]);
  const editing = usePartStore((s) => s.editing);
  const picking = usePartStore((s) => s.picking);
  const pickedFace = usePartStore((s) => s.pickedFace);
  const pending = usePartStore((s) => s.pending);
  const { setEditing, setPicking, setUpTo } = usePartStore.getState();
  const [sketching, setSketching] = useState<string | null>(null);
  const change = (next: Part) => useScene.getState().setPart(node.id, next);
  const mine = editing?.id === node.id ? editing : null;
  const feature = part.features.find((f) => f.id === mine?.feature);
  const sketch = part.sketches.find((s) => s.id === mine?.sketch);
  const statusOf = (id: string) => built?.statuses.find((s) => s.id === id);
  const patch = (p: Partial<PartFeature>) =>
    feature && change(updateFeature(part, feature.id, p));

  const num = (
    text: string,
    value: number,
    label: string,
    onChange: (v: number) => void,
    unit = "mm",
    step = 1,
  ) => (
    <label className="room-dim" key={label}>
      <span className="room-dim-label">{text}</span>
      <input
        type="number"
        className="room-dim-input f-num"
        inputMode="decimal"
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="room-dim-unit">{unit}</span>
    </label>
  );
  const pick = <T extends string>(
    text: string,
    value: T,
    options: readonly (T | [T, string])[],
    label: string,
    onChange: (v: T) => void,
  ) => (
    <label className="room-dim" key={label}>
      <span className="room-dim-label">{text}</span>
      <select
        className="room-dim-input part-select"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => {
          const [v, name] = Array.isArray(o) ? o : [o, o];
          return (
            <option key={v} value={v}>
              {name}
            </option>
          );
        })}
      </select>
    </label>
  );
  const sketchPick = (value: string, onChange: (v: string) => void) =>
    pick(
      "Sketch",
      value,
      part.sketches.map((s) => [s.id, s.name] as [string, string]),
      `${feature?.name ?? feature?.kind} sketch`,
      onChange,
    );
  const opPick = (
    value: "new" | "join" | "cut",
    onChange: (v: "new" | "join" | "cut") => void,
  ) =>
    pick(
      "Does",
      value,
      [
        ["new", "New body"],
        ["join", "Join"],
        ["cut", "Cut"],
      ] as const,
      `${feature?.name ?? feature?.kind} operation`,
      onChange,
    );

  /** a fillet's or a chamfer's edges: the rule, a pick, the readings */
  const edgesForm = (
    f: Extract<PartFeature, { kind: "fillet" | "chamfer" }>,
  ) => {
    const readings = pickedFace ? rulesOfFace(pickedFace) : [];
    const current = JSON.stringify(f.edges.rules[0] ?? null);
    const choose = (v: string) =>
      patch({
        edges: {
          rules: v === "all" ? [] : [JSON.parse(v) as FinderRule],
        },
      });
    return (
      <>
        <p className="detail-of part-rule" data-picking={picking}>
          Edges {finderSummary(f.edges)}
        </p>
        <div className="detail-acts">
          <button
            type="button"
            className="main-btn"
            aria-pressed={picking}
            onClick={() => setPicking(!picking)}
          >
            <span>{picking ? "Click a face on the part…" : "Pick a face"}</span>
          </button>
          {(readings.length > 0 || f.edges.rules.length > 0) && (
            <select
              className="room-dim-input part-select part-rule-pick"
              aria-label="Edge rule"
              value={
                f.edges.rules.length === 0
                  ? "all"
                  : readings.some((r) => JSON.stringify(r) === current)
                    ? current
                    : "current"
              }
              onChange={(e) => choose(e.target.value)}
            >
              {!readings.some((r) => JSON.stringify(r) === current) &&
                f.edges.rules.length > 0 && (
                  <option value="current">{finderSummary(f.edges)}</option>
                )}
              {readings.map((r) => (
                <option key={JSON.stringify(r)} value={JSON.stringify(r)}>
                  {finderSummary({ rules: [r] })}
                </option>
              ))}
              <option value="all">every edge</option>
            </select>
          )}
        </div>
      </>
    );
  };

  const form = feature && (
    <div className="part-form" data-feature={feature.id}>
      <div className="room-dims detail-panel">
        <label className="room-dim">
          <span className="room-dim-label">Name</span>
          <input
            className="room-dim-input"
            value={feature.name ?? ""}
            placeholder={featureSummary(feature)}
            aria-label="Feature name"
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        {feature.kind === "extrude" && (
          <>
            {sketchPick(feature.sketch, (sketch) => patch({ sketch }))}
            {num(
              "Distance",
              feature.distance,
              "Extrude distance in millimetres",
              (distance) => patch({ distance }),
            )}
            {pick(
              "Way",
              feature.direction,
              [
                ["one", "One way"],
                ["symmetric", "Both ways"],
                ["two", "Two distances"],
              ] as const,
              "Extrude direction",
              (direction) => patch({ direction }),
            )}
            {feature.direction === "two" &&
              num(
                "Back",
                feature.back ?? 0,
                "Extrude back distance in millimetres",
                (back) => patch({ back }),
              )}
            {opPick(feature.op, (op) => patch({ op }))}
          </>
        )}
        {feature.kind === "revolve" && (
          <>
            {sketchPick(feature.sketch, (sketch) => patch({ sketch }))}
            {pick(
              "Axis",
              (typeof feature.axis === "string" ? feature.axis : "y") as
                "x" | "y",
              [
                ["x", "Sketch x"],
                ["y", "Sketch y"],
              ] as const,
              "Revolve axis",
              (axis) => patch({ axis }),
            )}
            {num(
              "Angle",
              feature.angle,
              "Revolve angle in degrees",
              (angle) => patch({ angle }),
              "°",
            )}
            {opPick(feature.op, (op) => patch({ op }))}
          </>
        )}
        {feature.kind === "fillet" &&
          num(
            "Radius",
            feature.radius,
            "Fillet radius in millimetres",
            (radius) => patch({ radius }),
            "mm",
            0.5,
          )}
        {feature.kind === "chamfer" &&
          num(
            "Distance",
            feature.distance,
            "Chamfer distance in millimetres",
            (distance) => patch({ distance }),
            "mm",
            0.5,
          )}
        {feature.kind === "mirror" && (
          <>
            {pick("Plane", feature.plane, PLANES, "Mirror plane", (plane) =>
              patch({ plane }),
            )}
            {num("At", feature.at, "Mirror plane offset in millimetres", (at) =>
              patch({ at }),
            )}
          </>
        )}
        {feature.kind === "pattern" && (
          <>
            {pick(
              "Mode",
              feature.mode,
              [
                ["linear", "In a line"],
                ["circular", "In a ring"],
              ] as const,
              "Pattern mode",
              (mode) =>
                change(
                  updateFeature(
                    part,
                    feature.id,
                    mode === "linear"
                      ? { mode, spacing: 100 }
                      : ({ mode } as Partial<PartFeature>),
                  ),
                ),
            )}
            {pick("Axis", feature.axis, AXES, "Pattern axis", (axis) =>
              patch({ axis }),
            )}
            {num(
              "Count",
              feature.count,
              "Pattern count",
              (count) => patch({ count: Math.max(1, Math.round(count)) }),
              "",
            )}
            {feature.mode === "linear" &&
              num(
                "Apart",
                feature.spacing,
                "Pattern spacing in millimetres",
                (spacing) => patch({ spacing }),
              )}
          </>
        )}
      </div>
      {(feature.kind === "fillet" || feature.kind === "chamfer") &&
        edgesForm(feature)}
      <div className="detail-acts">
        <button
          type="button"
          className="main-btn"
          aria-pressed={!!feature.suppressed}
          onClick={() => patch({ suppressed: !feature.suppressed })}
        >
          <span>{feature.suppressed ? "Unsuppress" : "Suppress"}</span>
        </button>
        <button
          type="button"
          className="main-btn"
          disabled={part.features[0]?.id === feature.id}
          onClick={() =>
            change(
              moveFeature(
                part,
                feature.id,
                part.features.findIndex((f) => f.id === feature.id) - 1,
              ),
            )
          }
        >
          <span>Earlier</span>
        </button>
        <button
          type="button"
          className="main-btn"
          disabled={part.features.at(-1)?.id === feature.id}
          onClick={() =>
            change(
              moveFeature(
                part,
                feature.id,
                part.features.findIndex((f) => f.id === feature.id) + 1,
              ),
            )
          }
        >
          <span>Later</span>
        </button>
        <button
          type="button"
          className="main-btn"
          aria-label={`Remove ${feature.name ?? featureSummary(feature)}`}
          onClick={() => {
            change(removeFeature(part, feature.id));
            setEditing({ id: node.id });
          }}
        >
          <TrashIcon size={14} />
          <span>Remove</span>
        </button>
      </div>
    </div>
  );

  const sketchForm = sketch && (
    <div className="part-form" data-sketch={sketch.id}>
      <div className="room-dims detail-panel">
        <label className="room-dim">
          <span className="room-dim-label">Name</span>
          <input
            className="room-dim-input"
            value={sketch.name}
            aria-label="Sketch name"
            onChange={(e) =>
              change(updateSketch(part, sketch.id, { name: e.target.value }))
            }
          />
        </label>
        {pick("Plane", sketch.plane, PLANES, `${sketch.name} plane`, (plane) =>
          change(updateSketch(part, sketch.id, { plane })),
        )}
        {num(
          "At",
          sketch.at,
          `${sketch.name} plane offset in millimetres`,
          (at) => change(updateSketch(part, sketch.id, { at })),
        )}
      </div>
      <div className="detail-acts">
        <button
          type="button"
          className="main-btn"
          onClick={() => setSketching(sketch.id)}
        >
          <span>Edit sketch</span>
        </button>
        <button
          type="button"
          className="main-btn"
          aria-label={`Remove ${sketch.name}`}
          onClick={() => {
            change(removeSketch(part, sketch.id));
            setEditing({ id: node.id });
          }}
        >
          <TrashIcon size={14} />
          <span>Remove</span>
        </button>
      </div>
      {sketching === sketch.id && (
        <SketchEditor
          name={sketch.name}
          sketch={sketch.sketch}
          onClose={() => setSketching(null)}
          onDone={(s) => {
            setSketching(null);
            change(updateSketch(part, sketch.id, { sketch: s }));
          }}
        />
      )}
    </div>
  );

  const failed = built?.statuses.find((s) => s.state === "failed");
  return (
    <section className="eva-pref part-tab" aria-label="Part">
      <div className="eva-pref-head">
        <span className="eva-pref-title">Part</span>
        <span className="detail-of f-num">
          {pending > 0 && !built
            ? "building"
            : failed
              ? "a feature failed"
              : `${part.features.length} ${part.features.length === 1 ? "feature" : "features"}${built ? ` · ${Math.round(built.ms)} ms` : ""}`}
        </span>
      </div>
      <div className="eva-pref-head part-sub">
        <span className="detail-of">Sketches</span>
      </div>
      <div className="detail-parts" role="radiogroup" aria-label="Sketches">
        {part.sketches.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            className="detail-part"
            aria-checked={mine?.sketch === s.id}
            onClick={() =>
              setEditing(
                mine?.sketch === s.id
                  ? { id: node.id }
                  : { id: node.id, sketch: s.id },
              )
            }
          >
            <span className="detail-part-name">{s.name}</span>
            <span className="detail-part-price f-num">
              {s.plane} at {s.at}
            </span>
          </button>
        ))}
      </div>
      {sketchForm}
      <div className="detail-acts">
        <button
          type="button"
          className="main-btn"
          onClick={() => {
            const id = freshPartId(part, "s");
            change({
              ...part,
              sketches: [
                ...part.sketches,
                {
                  id,
                  name: `Sketch ${part.sketches.length + 1}`,
                  plane: "XY",
                  at: 0,
                  sketch: rectangleSketch(100, 100),
                },
              ],
            });
            setEditing({ id: node.id, sketch: id });
          }}
        >
          <PlusIcon size={14} />
          <span>Add sketch</span>
        </button>
      </div>
      <div className="eva-pref-head part-sub">
        <span className="detail-of">History</span>
        {upTo !== undefined && (
          <button
            type="button"
            className="main-btn part-rollback-off"
            onClick={() => setUpTo(node.id, undefined)}
          >
            <span>Build all</span>
          </button>
        )}
      </div>
      <div className="detail-parts" role="radiogroup" aria-label="Features">
        {part.features.map((f, i) => {
          const st = statusOf(f.id);
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              className="detail-part part-feature"
              aria-checked={mine?.feature === f.id}
              data-state={st?.state ?? "building"}
              data-rolled={upTo !== undefined && i >= upTo}
              onClick={() =>
                setEditing(
                  mine?.feature === f.id
                    ? { id: node.id }
                    : { id: node.id, feature: f.id },
                )
              }
            >
              <span className="detail-part-name">
                <span className="part-state" aria-hidden="true" />
                {f.name ?? featureSummary(f)}
              </span>
              <span className="detail-part-price">
                {f.name ? featureSummary(f) : stateWords(st)}
              </span>
            </button>
          );
        })}
      </div>
      {failed && (
        <p className="detail-of part-failed" role="status">
          {part.features.find((f) => f.id === failed.id)?.name ?? failed.id}{" "}
          {stateWords(failed)}
        </p>
      )}
      {form}
      <div className="detail-acts">
        {(
          [
            ["extrude", "Extrude"],
            ["revolve", "Revolve"],
            ["fillet", "Fillet"],
            ["chamfer", "Chamfer"],
            ["mirror", "Mirror"],
            ["pattern", "Pattern"],
          ] as const
        ).map(([kind, name]) => (
          <button
            key={kind}
            type="button"
            className="main-btn"
            aria-label={`Add ${name.toLowerCase()}`}
            disabled={
              (kind === "extrude" || kind === "revolve") &&
              !part.sketches.length
            }
            onClick={() => {
              const f = newFeature(part, kind);
              change({ ...part, features: [...part.features, f] });
              setEditing({ id: node.id, feature: f.id });
            }}
          >
            <PlusIcon size={14} />
            <span>{name}</span>
          </button>
        ))}
      </div>
      <div className="detail-acts">
        <button
          type="button"
          className="main-btn"
          disabled={!built?.mesh}
          onClick={() =>
            void partStepOf(part)
              .then((step) =>
                download(
                  `${slug(node.name)}.step`,
                  new Blob([step], { type: "application/step" }),
                ),
              )
              .catch(() => undefined)
          }
        >
          <span>{node.name} as STEP</span>
        </button>
      </div>
    </section>
  );
}
