import { SharePage } from "@/components/studio/SharePage";

/** A room someone shared: read-only, with a way to take it into a studio. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SharePage id={id} />;
}
