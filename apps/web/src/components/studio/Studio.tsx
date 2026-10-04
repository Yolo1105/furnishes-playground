import { AgentTab } from "./AgentTab";
import { AssetsPanel } from "./AssetsPanel";
import { MainShelf } from "./MainOverlays";
import { StudioShell, type ShellCorners } from "./StudioShell";

/** The whole studio: the project panel, the toolbar and shelf over the
    main surface, Eva on the right. Only the panels' corners differ
    between the two routes; Settings switches between them. */
export function Studio({ corners }: { corners: ShellCorners }) {
  return (
    <StudioShell corners={corners} left={<AssetsPanel />} right={<AgentTab />}>
      <MainShelf />
    </StudioShell>
  );
}
