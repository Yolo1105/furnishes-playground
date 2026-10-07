import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Ops } from "@/components/site/Ops";
import { adminOfHeaders } from "@/lib/ops";

export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** The studio's operations: for an admin, and not here for anyone else. */
export default async function Page() {
  const admin = await adminOfHeaders(await headers());
  if (!admin) notFound();
  return <Ops admin={admin.email} />;
}
