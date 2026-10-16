"use client";

import { Component, Fragment, type ReactNode } from "react";
import { useStudio } from "./studio-store";

/** whether this browser can draw 3D at all: a WebGL 2 context, or a
    WebGPU adapter (the API can be there with none behind it); asked
    only once the view has stopped */
const canDraw3D = async () => {
  try {
    if (document.createElement("canvas").getContext("webgl2")) return true;
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
};

/**
 * The 3D view's fall: anything the room in 3D throws while it draws
 * (a driver that loses the context, a shader the GPU refuses) leaves
 * the studio on its plan instead of a blank stage, with the reason in
 * the console and a stage that says so, where the room can be tried
 * again. The rest of the studio never notices.
 */
export class StageGuard extends Component<
  { children: ReactNode },
  { failed: boolean; tries: number; able: boolean | null }
> {
  override state = { failed: false, tries: 0, able: null as boolean | null };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.error("[3d] the view stopped", error);
    void canDraw3D().then((able) => this.setState({ able }));
    try {
      useStudio.getState().setView("2d");
    } catch {
      /* the plan is one click away on the stage below */
    }
  }
  override render() {
    if (!this.state.failed)
      return <Fragment key={this.state.tries}>{this.props.children}</Fragment>;
    // a browser with no 3D at all (an old one, or one with its graphics
    // turned off) is not offered a try that cannot work
    const able = this.state.able !== false;
    return (
      <div
        className="stage-3d"
        data-failed="true"
        data-no-3d={able ? "false" : "true"}
      >
        <div className="stage-preparing stage-failed" role="alert">
          <span className="stage-preparing-title">
            {able
              ? "The 3D view stopped"
              : "This browser cannot draw the room in 3D"}
          </span>
          <span className="stage-preparing-step">
            {able
              ? "The room is safe; the plan shows it meanwhile."
              : "The plan, the products and Eva all work here."}
          </span>
          <div className="shell-dialog-acts">
            <button
              type="button"
              className="main-btn"
              onClick={() => useStudio.getState().setView("2d")}
            >
              Show the plan
            </button>
            {able && (
              <button
                type="button"
                className="main-btn main-btn-primary"
                onClick={() =>
                  this.setState((s) => ({ failed: false, tries: s.tries + 1 }))
                }
              >
                Try 3D again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
