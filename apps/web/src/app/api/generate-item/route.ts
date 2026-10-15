import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { fal } from "@fal-ai/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { STUDIO_MATERIAL_NAMES } from "@/components/studio/studio-materials";
import { str } from "@/lib/env";
import { LIMITS } from "@/lib/limits";
import {
  admit,
  anthropicKey,
  countItem,
  countTokens,
  falKey,
  fallback,
  MODEL,
} from "@/lib/model";
import { MODEL_BYTES, readJson } from "@/lib/schemas";

/**
 * A room item from a few words, made only when no real model fits it
 * (the studio looks first, prop-variants.ts's retrieve): Flux Schnell
 * draws it in even, shadowless studio light on white, the whole object
 * in a three-quarter view, then Hunyuan 3D turns the picture into a
 * mesh with its PBR output, the full model for anything over half a
 * metre and the rapid one below. With a model connected, Claude reads
 * the picture for what the object is mostly made of, so the studio's
 * material can stand in for the generated one. All run with FAL_KEY
 * (and ANTHROPIC_API_KEY for the reading); without one the route says
 * so (503) and the studio stands the item up as a shape instead. A
 * caller gets a bounded number of items an hour and a bounded spend a
 * day, since each costs money; the picture is counted even when the
 * mesh after it fails. The mesh models' names can be set by the
 * environment, as the provider renames them.
 */
export const runtime = "nodejs";
export const maxDuration = 180;

const IMAGE_MODEL = "fal-ai/flux/schnell";
const MESH_MODEL = {
  rapid: str("FAL_MESH_RAPID") || "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d",
  full: str("FAL_MESH_FULL") || "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
};
/** past this, mm along its longest side, an item takes the full model */
const RAPID_MOST = 500;

const Body = z.object({
  prompt: z.string().trim().min(2).max(200),
  /** the item's longest side as it will stand, mm */
  longest: z.number().positive().max(10_000).optional(),
});

/** the mesh's file, wherever the provider puts it in its answer: the
    PBR output first */
const meshUrl = (out: Record<string, unknown>) => {
  for (const k of ["pbr_model", "model_glb", "model_mesh", "mesh"]) {
    const v = out[k] as { url?: string } | undefined;
    if (v?.url) return v.url;
  }
  const urls = out.model_urls as { glb?: { url?: string } } | undefined;
  return urls?.glb?.url;
};

const Made = z.object({ material: z.enum(STUDIO_MATERIAL_NAMES) });

/** what the pictured object is mostly made of, by Claude, or undefined
    without a model or an answer */
async function materialOf(req: Request, caller: string, imageUrl: string) {
  if (!anthropicKey()) return undefined;
  try {
    const response = await new Anthropic().messages.parse({
      model: MODEL,
      max_tokens: 64,
      output_config: { effort: "low", format: zodOutputFormat(Made) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            {
              type: "text",
              text: `What is the object in this picture mostly made of, by the surface you see most of? One of: ${STUDIO_MATERIAL_NAMES.join(", ")}.`,
            },
          ],
        },
      ],
    });
    await countTokens(req, caller, "item", response);
    return response.parsed_output?.material;
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  const body = await readJson(req, MODEL_BYTES);
  if (body.error) return body.error;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return fallback("bad-request", 400);
  const key = falKey();
  if (!key) return fallback("no-key", 503);
  const door = await admit(req, "item", LIMITS.itemsPerHour);
  if ("refused" in door) return door.refused;
  fal.config({ credentials: key });
  const mesh =
    (parsed.data.longest ?? 0) > RAPID_MOST
      ? MESH_MODEL.full
      : MESH_MODEL.rapid;
  let counted = false;
  try {
    const image = (await fal.subscribe(IMAGE_MODEL, {
      input: {
        prompt: `${parsed.data.prompt}, a single object, the whole of it in frame, three-quarter view, even shadowless studio light on a pure white background, no props, no cast shadows`,
        image_size: "square",
        num_inference_steps: 4,
      },
    })) as { data: { images?: { url: string }[] } };
    const imageUrl = image.data.images?.[0]?.url;
    if (!imageUrl) return fallback("no-image", 502);
    await countItem(req, door.caller, mesh);
    counted = true;
    const [made, material] = await Promise.all([
      fal.subscribe(mesh, {
        input: { input_image_url: imageUrl, enable_pbr: true },
      }) as Promise<{ data: Record<string, unknown> }>,
      materialOf(req, door.caller, imageUrl),
    ]);
    const modelUrl = meshUrl(made.data);
    return NextResponse.json({
      imageUrl,
      ...(modelUrl ? { modelUrl } : {}),
      ...(material ? { material } : {}),
    });
  } catch {
    if (!counted) await countItem(req, door.caller, IMAGE_MODEL);
    return fallback("provider", 502);
  }
}
