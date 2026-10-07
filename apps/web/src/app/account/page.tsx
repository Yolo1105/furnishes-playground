import type { Metadata } from "next";
import { Home } from "@/components/site/Home";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Account",
  description: `Sign in to ${SITE.name}, or make an account: your projects, orders and room items follow you to every device.`,
};

/** The account's page: the way in. */
export default function Page() {
  return <Home />;
}
