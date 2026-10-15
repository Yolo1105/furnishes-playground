/** the main stage's element (not the small view's): its data-*
    attributes say what the room is doing, for the dev panels and the
    guided demo that wait on them */
export const mainStage = () =>
  document.querySelector<HTMLElement>(".shell-stage .stage-3d");
