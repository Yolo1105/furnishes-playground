import { CubeIcon, PlanIcon, SwapIcon } from "./icons";
import { other, viewName, type View } from "./studio-store";

/**
 * The small view in the right rail: whichever of 3D and 2D the main
 * surface is not showing. The swap button trades them. Both surfaces are
 * placeholders until the scene and the plan render here.
 */
export function ViewPanel({
  main,
  onSwap,
}: {
  main: View;
  onSwap: () => void;
}) {
  const here = other(main);
  return (
    <>
      <div className="shell-panel-head shell-panel-head-sm">
        <span className="shell-panel-title view-title">
          {here === "2d" ? <PlanIcon size={14} /> : <CubeIcon size={14} />}
          {viewName(here)}
        </span>
        <button
          type="button"
          className="shell-iconbtn shell-tip"
          data-tooltip={`Show ${viewName(here)} in main`}
          aria-label={`Show ${viewName(here)} in main`}
          onClick={onSwap}
        >
          <SwapIcon />
        </button>
      </div>
      <div className="view-stub" data-view={here} aria-label={viewName(here)}>
        {here === "2d" ? (
          <div className="view-plan" aria-hidden="true" />
        ) : (
          <div className="view-iso" aria-hidden="true">
            <CubeIcon size={28} />
          </div>
        )}
      </div>
    </>
  );
}

/** The stage's placeholder for whichever view it holds: the room's
    outline on the plan grid, or the room as a box, on the gradient. */
export function MainView({ view }: { view: View }) {
  return (
    <div className="shell-main-hint" data-view={view}>
      {view === "2d" ? (
        <div className="view-plan view-plan-main" aria-hidden="true" />
      ) : (
        <div className="preview-room preview-room-sketch" aria-hidden="true" />
      )}
      <span>{viewName(view)}</span>
    </div>
  );
}
