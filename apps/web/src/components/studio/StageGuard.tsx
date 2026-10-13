"use client";

import { Component, Fragment, type ReactNode } from "react";
import { useStudio } from "./studio-store";

/**
 * The 3D view's fall: anything the room in 3D throws while it draws
 * (a driver that loses the context, a shader the GPU refuses) leaves
 * the studio on its plan instead of a blank stage, with the reason in
 * the console and a stage that says so, where the room can be tried
 * again. The rest of the studio never notices.
 */
export class StageGuard extends Component<
  { children: ReactNode },
  { failed: boolean; tries: number }
> {
  override state = { failed: false, tries: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.error("[3d] the view stopped", error);
    try {
      useStudio.getState().setView("2d");
    } catch {
      /* the plan is one click away on the stage below */
    }
  }
  override render() {
    if (!this.state.failed)
      return <Fragment key={this.state.tries}>{this.props.children}</Fragment>;
    return (
      <div className="stage-3d" data-failed="true">
        <div className="stage-preparing stage-failed" role="alert">
          <span className="stage-preparing-title">The 3D view stopped</span>
          <span className="stage-preparing-step">
            The room is safe; the plan shows it meanwhile.
          </span>
          <div className="shell-dialog-acts">
            <button
              type="button"
              className="main-btn"
              onClick={() => useStudio.getState().setView("2d")}
            >
              Show the plan
            </button>
            <button
              type="button"
              className="main-btn main-btn-primary"
              onClick={() =>
                this.setState((s) => ({ failed: false, tries: s.tries + 1 }))
              }
            >
              Try 3D again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
