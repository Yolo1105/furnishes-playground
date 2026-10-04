import { CubeIcon, PlanIcon, SwapIcon } from "./icons";
import dynamic from "next/dynamic";
import { Plan2D } from "./Plan2D";
import { StagePieces } from "./StagePieces";
import { other, viewName, type View } from "./studio-store";

/* the 3D scene needs the browser's WebGL: it is never rendered on the server */
const Scene3D = dynamic(() => import("./Scene3D"), { ssr: false });

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

/** The stage for whichever view it holds, between the rails: the plan
    (the grid runs under the rails; the drawn plan and its pieces on it)
    or the room in 3D. */
export function MainView({ view }: { view: View }) {
  return (
    <div className="shell-main-hint" data-view={view}>
      {view === "2d" && (
        <div className="view-plan view-plan-main" aria-hidden="true" />
      )}
      <div className="stage-room">
        {/* the scene stays mounted while the plan shows, hidden: its
            WebGL context and its overlays survive the swap */}
        <div className="stage-3d-slot" hidden={view !== "3d"}>
          <Scene3D />
        </div>
        {view === "2d" && (
          <div className="preview-room stage-room-pieces">
            <Plan2D>
              <StagePieces />
            </Plan2D>
          </div>
        )}
      </div>
    </div>
  );
}
