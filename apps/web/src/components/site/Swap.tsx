"use client";

import { SITE } from "@/lib/site";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { sgd } from "@/components/studio/assets-data";
import type { Swap } from "./swaps";

/**
 * The spot as it is, and the spot with the piece in it, in one picture
 * with a line the visitor drags. It draws its own line back once, slowly,
 * the first time a spot is seen, so what the two halves are needs no
 * explaining; then it holds. Nothing here plays on a loop.
 */
const SHOWN = 0.62;
const OPEN = 0.3;
const WIDTH = 960;
const HEIGHT = 600;

export function Swaps({ swaps }: { swaps: Swap[] }) {
  const [at, setAt] = useState(0);
  const [cut, setCut] = useState(SHOWN);
  const [held, setHeld] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  const now = swaps[at];

  useEffect(() => {
    if (shown.current || held) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now() + (still ? 0 : 900);
    const step = (t: number) => {
      const u = still ? 1 : Math.min(1, Math.max(0, (t - start) / 1400));
      const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      setCut(SHOWN + (OPEN - SHOWN) * ease);
      if (u < 1) raf = requestAnimationFrame(step);
      else shown.current = true;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [held, at]);

  const drag = useCallback((e: React.PointerEvent) => {
    const el = box.current;
    if (!el || (e.pointerType === "mouse" && e.buttons === 0)) return;
    const r = el.getBoundingClientRect();
    setHeld(true);
    shown.current = true;
    setCut(Math.min(0.97, Math.max(0.03, (e.clientX - r.left) / r.width)));
  }, []);

  const go = (i: number) => {
    setAt((i + swaps.length) % swaps.length);
    setCut(SHOWN);
    shown.current = false;
    setHeld(false);
  };

  if (!now) return null;
  const index = (i: number) => String(i + 1).padStart(2, "0");
  return (
    <section className="ld-swap" aria-labelledby="ld-say">
      <div className="ld-swap-head">
        <p className="ld-eye">
          [ {index(at)} / {index(swaps.length - 1)} · {now.where} ]
        </p>
        <h2 className="ld-say" id="ld-say">
          {now.say}
        </h2>
      </div>

      <div
        ref={box}
        className="ld-pair"
        onPointerDown={(e) => {
          e.preventDefault();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // the pointer has already gone
          }
          drag(e);
        }}
        onPointerMove={drag}
        style={{ ["--cut" as string]: `${(cut * 100).toFixed(2)}%` }}
        data-cut={cut.toFixed(2)}
      >
        <Image
          src={now.after}
          alt={`${now.name} standing in ${now.where}`}
          width={WIDTH}
          height={HEIGHT}
          unoptimized
          draggable={false}
          priority={at === 0}
        />
        <div className="ld-before">
          <Image
            src={now.before}
            alt={`The same spot without it: ${now.say}`}
            width={WIDTH}
            height={HEIGHT}
            unoptimized
            draggable={false}
            priority={at === 0}
          />
        </div>
        <span className="ld-mark ld-mark-left">As it is</span>
        <span className="ld-mark ld-mark-right">
          With the {now.name.toLowerCase()}
        </span>
        <span className="ld-line" aria-hidden="true">
          <b>↔</b>
        </span>
      </div>

      <div className="ld-answer">
        <div>
          <p className="ld-eye">[ what we would put there ]</p>
          <h3 className="ld-answer-name">{now.name}</h3>
          <p className="ld-lede">{now.line}</p>
          <p className="ld-build">
            {now.build} ·{" "}
            <span className="ld-nowrap">
              {sgd(now.price)} <small>estimate</small>
            </span>
          </p>
          <Link className="ld-btn" href={`${SITE.studio}?piece=${now.id}`}>
            See it in the studio
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
        <nav className="ld-spots" aria-label="The other spots">
          <button type="button" className="ld-quiet" onClick={() => go(at - 1)}>
            ← Back
          </button>
          <ol className="ld-dots">
            {swaps.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-label={s.say}
                  aria-current={i === at}
                  onClick={() => go(i)}
                />
              </li>
            ))}
          </ol>
          <button type="button" className="ld-quiet" onClick={() => go(at + 1)}>
            Next spot →
          </button>
        </nav>
      </div>
    </section>
  );
}
