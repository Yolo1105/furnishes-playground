"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { HomeRail } from "./HomeRail";
import { HomeSignIn } from "./HomeSignIn";
import { useSession } from "@/lib/auth-client";

/**
 * The home page, where the site opens: the way in. A rail in the
 * production account page's language beside a stage that holds the
 * account form (HomeSignIn). Whoever is signed in, or has just signed
 * in, goes straight on into the studio; `from` says which, the square
 * or the rounded one.
 */
export function Home() {
  const router = useRouter();
  const studio =
    useSearchParams().get("from") === "studio" ? "/studio" : "/rounded";
  const { data: session, isPending } = useSession();
  useEffect(() => {
    if (session) router.replace(studio);
  }, [session, router, studio]);
  return (
    <div className="home">
      <HomeRail current="account" studio={studio} />
      <section className="home-stage">
        {isPending || session ? (
          <p className="home-eye home-wait">One moment.</p>
        ) : (
          <HomeSignIn studio={studio} />
        )}
      </section>
    </div>
  );
}
