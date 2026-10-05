"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
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
      <aside className="home-rail" aria-label="Account">
        <div className="home-brand">
          FURNISHES <b>「</b>STUDIO<b>」</b>
        </div>
        <div className="home-scroll">
          <div className="home-group">
            <p className="home-group-h">Workspace</p>
            <nav className="home-modes" aria-label="Workspace">
              <Link className="home-mode" href={studio}>
                <span>Studio</span>
                <span className="home-ix">[01]</span>
              </Link>
              <span className="home-mode" aria-current="page">
                <span>Account</span>
                <span className="home-ix">[02]</span>
              </span>
            </nav>
          </div>
        </div>
        <div className="home-foot">
          <span className="home-rule" aria-hidden="true" />
          <h2 className="home-tagline">
            A design studio where rooms move off-template
          </h2>
          <p className="home-credit">
            © {new Date().getFullYear()}, Furnishes Studio
          </p>
        </div>
      </aside>
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
