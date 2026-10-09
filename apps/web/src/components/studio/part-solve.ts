import type { GcsWrapper } from "@salusoft89/planegcs";
import {
  constraintIdOf,
  type Sketch,
  type SketchSolve,
  solved,
  toPrimitives,
} from "@furnishes/domain";

/**
 * A sketch solved by planegcs: its primitives pushed, the system
 * solved and the solution applied, the points (and circles' radii)
 * taken back, with how many degrees of freedom are left and which
 * constraints the solver found fighting or repeating, named by the
 * sketch's own constraint ids. Pure for a wrapper handed in, so the
 * worker and a test under Node drive it the same way.
 */
/** the solver's own statuses: settled, converged, failed, invalid */
const SETTLED = new Set([0, 1]);

export const solveWith = (w: GcsWrapper, sketch: Sketch): SketchSolve => {
  w.clear_data();
  w.push_primitives_and_params(toPrimitives(sketch) as never);
  const status = w.solve();
  const ok = SETTLED.has(status);
  if (ok) w.apply_solution();
  const ids = (xs: string[]) => [...new Set(xs.map(constraintIdOf))];
  return {
    sketch: ok
      ? solved(sketch, w.sketch_index.get_primitives() as never)
      : sketch,
    dof: w.gcs.dof(),
    conflicting: ids(w.get_gcs_conflicting_constraints()),
    redundant: ids(w.get_gcs_redundant_constraints()),
    ok,
  };
};
