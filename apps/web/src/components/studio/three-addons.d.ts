/** three's own typings stop short of this add-on (the others it ships
    with are declared): the node that lights a material from a
    LightProbeGrid, as the renderer's library takes it */
declare module "three/examples/jsm/tsl/lighting/LightProbeGridNode.js" {
  import type { LightProbeGrid } from "three/examples/jsm/lighting/LightProbeGrid.js";
  import type { AnalyticLightNode } from "three/webgpu";

  export const LightProbeGridNode: new (
    light: LightProbeGrid,
  ) => AnalyticLightNode<LightProbeGrid>;
}
