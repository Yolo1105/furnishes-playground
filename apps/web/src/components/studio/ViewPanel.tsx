import { CubeIcon, PlanIcon, SwapIcon } from "./icons";
import dynamic from "next/dynamic";
import { Elevation2D } from "./Elevation2D";
import { MiniIso } from "./MiniViews";
import { Plan2D } from "./Plan2D";
import { other, useStudio, viewName, type View } from "./studio-store";

/* the 3D scene needs the browser's WebGL: it is never rendered on the server */
const Scene3D = dynamic(() => import("./Scene3D"), { ssr: false });

/**
 * The small view in the right rail: whichever of 3D and 2D the main
 * surface is not showing, as a small copy that follows the room and the
 * pieces; on the small plan a piece is picked and dragged as on the
 * large one, and the 3D room follows. The swap button trades them.
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
          <div className="view-plan view-mini">
            <Plan2D interactive={false} />
          </div>
        ) : (
          <div className="view-iso view-mini" aria-hidden="true">
            <MiniIso />
          </div>
        )}
      </div>
    </>
  );
}

/** The stage for whichever view it holds, between the rails: the plan
    (the grid runs under the rails; the drawn plan and its pieces on it)
    or, at the cube's other 2D angles, one wall's elevation; or the room
    in 3D. */
export function MainView({ view }: { view: View }) {
  const angle = useStudio((s) => s.angle);
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
          <div className="stage-room-box stage-room-pieces">
            {angle === "Plan" ? <Plan2D /> : <Elevation2D angle={angle} />}
          </div>
        )}
      </div>
    </div>
  );
}
