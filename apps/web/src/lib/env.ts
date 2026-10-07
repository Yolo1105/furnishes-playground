/**
 * A number from the environment, or its default: the shares, the caps
 * and the rates all read this way, so a deployment can tune any of them
 * without a release, and a checkout runs with the numbers the tests
 * know. A value that is not a number, or is negative, is the default.
 */
export const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
