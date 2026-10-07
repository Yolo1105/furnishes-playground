import { fal } from "@fal-ai/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LIMITS } from "@/lib/limits";
import { admit, countItem, falKey, fallback } from "@/lib/model";

/**
 * A room item from a few words, the way the archive made them: Flux
 * Schnell draws a product shot of it, then Hunyuan 3D turns the picture
 * into a mesh. Both run on fal.ai with FAL_KEY; without a key the route
 * says so (503) and the studio stands the item up as a shape instead. A
 * caller gets a bounded number of items an hour and a bounded spend a
 * day, since each costs money; the picture is counted even when the
 * mesh after it fails.
 */
export const runtime = "nodejs";
export const maxDuration = 180;

const IMAGE_MODEL = "fal-ai/flux/schnell";
const MESH_MODEL = "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d";

const Body = z.object({ prompt: z.string().trim().min(2).max(200) });

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
  const key = falKey();
  if (!key) return fallback("no-key", 503);
  const door = await admit(req, "item", LIMITS.itemsPerHour);
  if ("refused" in door) return door.refused;
  fal.config({ credentials: key });
  let counted = false;
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
    await countItem(req, door.caller, MESH_MODEL);
    counted = true;
    const mesh = (await fal.subscribe(MESH_MODEL, {
      input: { input_image_url: imageUrl, enable_pbr: true },
    })) as { data: Record<string, unknown> };
    const modelUrl = meshUrl(mesh.data);
    return NextResponse.json({ imageUrl, ...(modelUrl ? { modelUrl } : {}) });
  } catch {
    if (!counted) await countItem(req, door.caller, IMAGE_MODEL);
    return fallback("provider", 502);
  }
}
