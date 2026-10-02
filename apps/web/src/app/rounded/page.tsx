import { MainShelf, placeholderCards } from "@/components/studio/MainOverlays";
import { GhostRows, StudioShell } from "@/components/studio/StudioShell";

/** The same studio with floating, rounded glass panels, a toolbar across the
    top of the main surface and a shelf of pieces along its bottom. */
export default function Page() {
  return (
    <StudioShell
      corners="rounded"
      topBar
      left={<GhostRows />}
      right={<GhostRows />}
    >
      <div className="shell-main-hint">Main</div>
      <MainShelf cards={placeholderCards} />
    </StudioShell>
  );
}
