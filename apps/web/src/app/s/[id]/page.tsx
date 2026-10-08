import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { SharePage } from "@/components/studio/SharePage";
import { getDb } from "@/lib/db";
import { share } from "@/lib/db/schema";
import { SITE } from "@/lib/site";

type Props = { params: Promise<{ id: string }> };

/** a shared room is its owner's to show, not a crawler's to list; a
    pasted link carries the room's name */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { db, ready } = getDb();
  const name = await ready
    .then(async () => {
      const [row] = await db
        .select({ name: share.name })
        .from(share)
        .where(eq(share.id, id))
        .limit(1);
      return row?.name ?? null;
    })
    .catch(() => null);
  return {
    title: name ? `${name} · a shared room` : "A shared room",
    description: name
      ? `${name}, a room shared from ${SITE.name}.`
      : `A room shared from ${SITE.name}.`,
    robots: { index: false, follow: false },
  };
}

/** A room someone shared: read-only, with a way to take it into a studio. */
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <SharePage id={id} />;
}
