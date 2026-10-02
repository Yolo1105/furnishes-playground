import { AssetsPanel } from "@/components/studio/AssetsPanel";
import { GhostRows, StudioShell } from "@/components/studio/StudioShell";

/** The studio: square, edge-to-edge glass panels either side of the main surface. */
export default function Page() {
  return (
    <StudioShell
      corners="square"
      left={<AssetsPanel />}
      right={<GhostRows />}
    ></StudioShell>
  );
}
