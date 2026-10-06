import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPassword } from "@/components/site/ResetPassword";

export const metadata: Metadata = {
  title: "A new password",
  robots: { index: false, follow: false },
};

/** Where the link in the reset mail opens: a new password. */
export default function Page() {
  // the page reads its token from the address: a boundary keeps the
  // page itself static
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}
