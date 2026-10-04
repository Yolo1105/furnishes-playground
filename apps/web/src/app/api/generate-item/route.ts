import { fal } from "@fal-ai/client";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * A room item from a few words, the way the archive made them: Flux
 * Schnell draws a product shot of it, then Hunyuan 3D turns the picture
 * into a mesh. Both run on fal.ai with FAL_KEY; without a key the route
 * says so (503) and the studio stands the item up as a shape instead. A
 * browser gets a bounded number of items an hour, since each costs money.
 */
export const runtime = "nodejs";
export const maxDuration = 180;

const IMAGE_MODEL = "fal-ai/flux/schnell";
const MESH_MODEL = "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d";
const ITEMS_PER_HOUR = 12;
const HOUR = 60 * 60 * 1000;

const Body = z.object({ prompt: z.string().trim().min(2).max(200) });

const seen = new Map<string, number[]>();
const allowed = (key: string) => {
  const now = Date.now();
  const hits = (seen.get(key) ?? []).filter((t) => now - t < HOUR);
  if (hits.length >= ITEMS_PER_HOUR) return false;
  hits.push(now);
  seen.set(key, hits);
  return true;
};

const fallback = (reason: string, status: number) =>
  NextResponse.json({ fallback: true, reason }, { status });

/** the mesh's file, wherever the provider puts it in its answer */
const meshUrl = (out: Record<string, unknown>) => {
  for (const k of ["model_glb", "model_mesh", "pbr_model", "mesh"]) {
    const v = out[k] as { url?: string } | undefined;
    if (v?.url) return v.url;
  }
  const urls = out.model_urls as { glb?: { url?: string } } | undefined;
  return urls?.glb?.url;
};

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fallback("bad-request", 400);
  const key = process.env.FAL_KEY;
  if (!key) return fallback("no-key", 503);
  const who = req.headers.get("x-forwarded-for") ?? "local";
  if (!allowed(who)) return fallback("rate-limit", 429);
  fal.config({ credentials: key });
  try {
    const image = (await fal.subscribe(IMAGE_MODEL, {
      input: {
        prompt: `${parsed.data.prompt}, a single piece of furniture, product photograph on a plain pale background, soft daylight, three-quarter view`,
        image_size: "square",
        num_inference_steps: 4,
      },
    })) as { data: { images?: { url: string }[] } };
    const imageUrl = image.data.images?.[0]?.url;
    if (!imageUrl) return fallback("no-image", 502);
    const mesh = (await fal.subscribe(MESH_MODEL, {
      input: { input_image_url: imageUrl, enable_pbr: true },
    })) as { data: Record<string, unknown> };
    const modelUrl = meshUrl(mesh.data);
    return NextResponse.json({ imageUrl, ...(modelUrl ? { modelUrl } : {}) });
  } catch {
    return fallback("provider", 502);
  }
}
