import type { Metadata } from "next";
import { Privacy } from "@/components/studio/Privacy";

export const metadata: Metadata = { title: "Privacy & terms" };

/** What the studio keeps, where, and on what terms. */
export default function Page() {
  return <Privacy />;
}
