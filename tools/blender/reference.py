"""Cycles reference renders of a room exported from the studio.

Run on a machine with Blender 4.x:

    blender -b -P tools/blender/reference.py -- --glb room.glb --out refs/ --samples 512

The room is the .glb that Export > 3D model writes (the shell, the
pieces, the window's outside as a glowing plane, five named cameras
and the sun). Each named camera is rendered once at the studio's stage
size, lit by the same HDRI file the studio uses plus the exported sun,
with Cycles (the GPU when there is one), OpenImageDenoise, the AgX view
transform and the studio's exposure, to PNGs named like the kept
pictures, so tools/compare-refs.mjs can set them side by side.

Arguments after `--`:
  --glb PATH        the exported room (required)
  --out DIR         where the PNGs go (default refs/)
  --samples N       Cycles samples (default 512)
  --hdri PATH       the HDRI to light with (default apps/web/public/sky/apartment.hdr)
  --exposure F      the studio's exposure (default 1.1)
  --size WxH        the picture size (default 1440x900)
  --cpu             force the CPU even when a GPU is there
"""

import argparse
import math
import os
import sys

import bpy  # type: ignore[import-not-found]


def args_after_dashes() -> list[str]:
    argv = sys.argv
    return argv[argv.index("--") + 1 :] if "--" in argv else []


def parse() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Cycles reference renders of a studio room")
    p.add_argument("--glb", required=True)
    p.add_argument("--out", default="refs/")
    p.add_argument("--samples", type=int, default=512)
    p.add_argument("--hdri", default="apps/web/public/sky/apartment.hdr")
    p.add_argument("--exposure", type=float, default=1.1)
    p.add_argument("--size", default="1440x900")
    p.add_argument("--cpu", action="store_true")
    return p.parse_args(args_after_dashes())


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_room(path: str) -> None:
    bpy.ops.import_scene.gltf(filepath=path)


def set_world(hdri: str) -> None:
    world = bpy.data.worlds.new("Studio sky") if not bpy.data.worlds else bpy.data.worlds[0]
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    env = nodes.new("ShaderNodeTexEnvironment")
    if os.path.exists(hdri):
        env.image = bpy.data.images.load(os.path.abspath(hdri))
    else:
        print(f"reference: no HDRI at {hdri}; the sky is a plain grey")
        bg.inputs["Color"].default_value = (0.6, 0.65, 0.7, 1)
    links.new(env.outputs["Color"], bg.inputs["Color"])
    links.new(bg.outputs["Background"], out.inputs["Surface"])


def set_cycles(samples: int, exposure: float, size: str, cpu: bool) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    prefs = bpy.context.preferences.addons.get("cycles")
    if prefs and not cpu:
        cprefs = prefs.preferences
        for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
            try:
                cprefs.compute_device_type = kind
                cprefs.get_devices()
                if any(d.use for d in cprefs.devices if d.type != "CPU"):
                    scene.cycles.device = "GPU"
                    print(f"reference: rendering on {kind}")
                    break
            except Exception:
                continue
    # the studio's look: AgX, its exposure
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = math.log2(exposure) if exposure > 0 else 0
    w, h = (int(v) for v in size.lower().split("x"))
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False


def cameras() -> list:
    return [o for o in bpy.context.scene.objects if o.type == "CAMERA"]


def render_each(out: str) -> None:
    os.makedirs(out, exist_ok=True)
    scene = bpy.context.scene
    cams = cameras()
    if not cams:
        print("reference: the .glb carries no cameras; export it from the studio")
        return
    for cam in cams:
        scene.camera = cam
        name = cam.name.lower().replace(" ", "-")
        scene.render.filepath = os.path.join(out, f"{name}.png")
        print(f"reference: rendering {cam.name} -> {scene.render.filepath}")
        bpy.ops.render.render(write_still=True)


def main() -> None:
    a = parse()
    clear_scene()
    import_room(a.glb)
    set_world(a.hdri)
    set_cycles(a.samples, a.exposure, a.size, a.cpu)
    render_each(a.out)


if __name__ == "__main__":
    main()
