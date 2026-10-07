import { z } from "zod";
import { ASSET_CATEGORIES, ASSET_KINDS } from "@/components/studio/assets-data";
import { PERSONAS } from "@/components/studio/eva-data";
import { ROOM_IDS } from "@/components/studio/room-data";

/** the studio's facts, as every route that asks the model takes them:
    the same names the studio uses, so the two cannot drift */
const names = <T extends string>(list: readonly T[]) =>
  z.enum(list as [T, ...T[]]);

export const ContextBody = z.object({
  room: z.object({
    id: names(ROOM_IDS),
    flat: z.string().max(20),
    width: z.number(),
    depth: z.number(),
    height: z.number(),
    sized: z.boolean(),
  }),
  pieces: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(80),
        kind: names(ASSET_KINDS),
        category: names(ASSET_CATEGORIES),
        price: z.number().optional(),
        at: z
          .object({
            x: z.number(),
            y: z.number(),
            w: z.number(),
            d: z.number(),
            rotation: z.number(),
          })
          .optional(),
      }),
    )
    .max(200),
  cart: z.array(z.string()).max(200),
  findings: z.array(z.string().max(200)).max(20).default([]),
  prefs: z.record(
    z.string(),
    z.object({
      values: z.array(z.string()),
      budget: z.tuple([z.number(), z.number()]).optional(),
    }),
  ),
  exploration: z.boolean(),
  rules: z.object({
    walkway: z.number(),
    doorClear: z.boolean(),
    windowClear: z.boolean(),
    bedWall: z.enum(["prefer", "required", "off"]),
    mustHave: z.array(z.string().max(40)).max(20),
    spacing: z.number(),
    flow: z.number().min(0).max(100).default(50),
    open: z.number().min(0).max(100).default(50),
  }),
  persona: names(PERSONAS.map((p) => p.id)).default("eva"),
});
