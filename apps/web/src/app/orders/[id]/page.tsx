import type { Metadata } from "next";
import { OrderPage } from "@/components/site/OrderPage";

/** an order is its buyer's to read, not a crawler's to list */
export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false },
};

/** One order, by its number and the key the mails and the payment page
    carry (?key=); without the key, the signed-in owner's. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id } = await params;
  const { key } = await searchParams;
  return <OrderPage id={id} orderKey={key ?? ""} />;
}
