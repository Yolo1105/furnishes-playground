import type { ReactNode } from "react";
import { readingUrl, type Reading } from "@/lib/site";

/** one of the studio's readings (help, terms, privacy), opened beside
    the studio in a tab of its own, so the room stays as it is */
export function ReadingLink({
  reading,
  children,
}: {
  reading: Reading;
  children: ReactNode;
}) {
  return (
    <a href={readingUrl(reading)} target="_blank" rel="noopener">
      {children}
    </a>
  );
}
