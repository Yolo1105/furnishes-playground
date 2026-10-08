import { NextResponse } from "next/server";
import { z } from "zod";
import { LINE_MIN, PHONE, POSTAL, RECIPIENT_MIN } from "./address";
import { EMAIL, EMAIL_MAX } from "./email";
import { LIMITS } from "./limits";

/** the fields more than one route reads, checked the one way */
export const EmailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX)
  .regex(EMAIL);

export const AddressSchema = z.object({
  recipient: z.string().trim().min(RECIPIENT_MIN).max(80),
  line1: z.string().trim().min(LINE_MIN).max(200),
  postal: z.string().trim().regex(POSTAL),
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(z.string().regex(PHONE)),
});

/** the one shape every route answers a bad request or a refusal with */
export const BAD_REQUEST = { error: "bad request" } as const;

/** bytes a route's JSON body may hold unless it says otherwise: room
    for a chat's thread and its context, not for a flood */
export const JSON_BYTES = 1_000_000;

/** a request's JSON body, read with a cap on its size: a body said
    (Content-Length) or found to be over `maxBytes` is refused as 413
    before it is parsed; one that is not JSON reads as null, for the
    route's own schema to refuse */
export async function readJson(
  req: Request,
  maxBytes = JSON_BYTES,
): Promise<{ value: unknown; error?: undefined } | { error: NextResponse }> {
  const tooLarge = () => ({
    error: NextResponse.json({ error: "too large" }, { status: 413 }),
  });
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes)
    return tooLarge();
  const text = await req.text().catch(() => "");
  if (text.length > maxBytes) return tooLarge();
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return { value: null };
  }
}

/** a project's snapshot as a shared room or a mirrored document holds
    it: the room, the scene (its groups, cart, labels and the pieces'
    properties) and Eva's side, each a record; what is inside each is
    the studio's own shape, versioned by `v` */
export const SnapshotSchema = z
  .object({
    v: z.number().optional(),
    room: z.record(z.string(), z.unknown()),
    scene: z
      .object({
        groups: z.array(z.record(z.string(), z.unknown())),
        cart: z.array(z.string()),
        labels: z.array(z.string()),
        overrides: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
    eva: z.record(z.string(), z.unknown()),
  })
  .passthrough();

const Gone = z.record(z.string(), z.number());
const Dated = z.object({ id: z.string(), at: z.number() }).passthrough();
/** the five documents the account mirrors, each in the shape the
    browser's stores keep it; a document of another shape is refused,
    so one bad device cannot break every other's pull */
export const SyncKinds = {
  projects: z.object({
    projects: z.array(
      z
        .object({ id: z.string(), name: z.string(), at: z.number() })
        .passthrough(),
    ),
    gone: Gone,
  }),
  orders: z.array(
    z
      .object({ id: z.string(), at: z.number(), status: z.string() })
      .passthrough(),
  ),
  generations: z.object({ generations: z.array(Dated), gone: Gone }),
  guides: z.record(z.string(), z.boolean()),
  board: z.object({ pictures: z.array(Dated), gone: Gone }),
} as const;
export type SyncKind = keyof typeof SyncKinds;
export const SYNC_KINDS = Object.keys(SyncKinds) as SyncKind[];
/** bytes a whole mirror may weigh: the five documents at their cap */
export const SYNC_BYTES = LIMITS.documentBytes * SYNC_KINDS.length;
