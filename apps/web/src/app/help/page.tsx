import type { Metadata } from "next";
import { Help } from "@/components/site/Help";

export const metadata: Metadata = {
  title: "Help",
  description:
    "How Furnishes pieces are made, delivered and built, what can be returned, where a price comes from, and how to get a spot planned with you.",
};

/** How it works, and how to reach the studio. */
export default function Page() {
  return <Help />;
}
