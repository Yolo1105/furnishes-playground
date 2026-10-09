import { useLayoutEffect, useRef, useState } from "react";

/**
 * A handler that keeps its identity across renders and calls the
 * latest function given. A handler on a three object is a prop to
 * fiber: a fresh function each render counts as a change, fiber
 * applies it and asks the demand loop for a frame, so a component
 * that re-renders when the picture settles would ask for the next
 * frames and the picture would never rest. Handed through this, the
 * prop never changes.
 */
export const useEvent = <A extends unknown[], R>(
  fn: (...args: A) => R,
): ((...args: A) => R) => {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  // the one function, made once: it reads the ref only when called
  const [stable] = useState(
    () =>
      (...args: A) =>
        latest.current(...args),
  );
  return stable;
};
