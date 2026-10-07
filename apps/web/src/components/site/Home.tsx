"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HomeRail } from "./HomeRail";
import { HomeSignIn } from "./HomeSignIn";
import { useSession } from "@/lib/auth-client";
import { SITE } from "@/lib/site";

/**
 * The account page: the way in. The rail beside a stage that holds
 * the account form (HomeSignIn). Whoever is signed in, or has just
 * signed in, goes straight on into the studio.
 */
export function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  useEffect(() => {
    if (session) router.replace(SITE.studio);
  }, [session, router]);
  return (
    <div className="home">
      <HomeRail current="account" />
      <section className="home-stage">
        {isPending || session ? (
          <p className="home-eye home-wait">One moment.</p>
        ) : (
          <HomeSignIn />
        )}
      </section>
    </div>
  );
}
