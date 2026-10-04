/**
 * A bounded number of goes an hour per caller, counted in memory on
 * this server: enough for one studio behind one key, where the cost is
 * the model's or the generator's; a fleet of servers would count in a
 * store they share. The caller is who the proxy says it is, and one
 * name for everyone where there is no proxy.
 */
const HOUR = 60 * 60 * 1000;

export const perHour = (max: number) => {
  const seen = new Map<string, number[]>();
  return (key: string) => {
    const now = Date.now();
    const hits = (seen.get(key) ?? []).filter((t) => now - t < HOUR);
    if (hits.length >= max) return false;
    hits.push(now);
    seen.set(key, hits);
    return true;
  };
};

export const callerOf = (req: Request) =>
  req.headers.get("x-forwarded-for") ?? "local";
