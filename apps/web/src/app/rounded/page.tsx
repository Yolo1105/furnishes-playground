import { AssetsPanel } from "@/components/studio/AssetsPanel";
import { MainShelf } from "@/components/studio/MainOverlays";
import { GhostRows, StudioShell } from "@/components/studio/StudioShell";

/** The same studio with floating, rounded glass panels, a toolbar across the
    top of the main surface and a shelf of pieces along its bottom. */
export default function Page() {
  return (
    <StudioShell
      corners="rounded"
      topBar
      left={<AssetsPanel />}
      right={<GhostRows />}
    >
      <MainShelf />
    </StudioShell>
  );
}
