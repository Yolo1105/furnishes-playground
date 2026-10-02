import { GhostRows, StudioShell } from "@/components/studio/StudioShell";

/** The same studio with floating, rounded glass panels. */
export default function Page() {
  return (
    <StudioShell corners="rounded" left={<GhostRows />} right={<GhostRows />}>
      <div className="shell-main-hint">Main</div>
    </StudioShell>
  );
}
