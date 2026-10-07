import type { Metadata } from "next";
import { Privacy } from "@/components/site/Privacy";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What the studio keeps, in the browser and under an account, the one cookie, the services behind it, and how to take everything with you or end it.",
};

/** What the studio keeps, where, and on what terms. */
export default function Page() {
  return <Privacy />;
}
