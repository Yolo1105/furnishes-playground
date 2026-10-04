import { Suspense } from "react";
import { AccountPage } from "@/components/studio/AccountPage";

/** The account: who is signed in, the mirror, the projects and orders. */
export default function Page() {
  return (
    <Suspense>
      <AccountPage />
    </Suspense>
  );
}
