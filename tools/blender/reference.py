"""Cycles reference renders of a room exported from the studio: the
yardstick the live view is judged against.

Run with Blender 4.2+ (or the `bpy` module, 5.x, on Python 3.13):

    blender -b -P tools/blender/reference.py -- --glb room.glb --out refs/
    python tools/blender/reference.py --glb room.glb --out refs/

The room is the .glb that Export > 3D model writes: the shell, the
pieces, each window's outside as a glowing plane, the named cameras and
the sun. What a real room gets, and the export does not say:

- Daylight through the glass. The outside planes (extras role
  "outside") are the live view's stand-in for the world beyond the
  window; they block the sky and the sun, so they are hidden and an
  outdoor HDRI lights the room and is what the windows show.
- The sun at a daylight strength. three.js's 11 is read by the glTF
  importer as lux and divided by 683 (0.016 W/m2: no sun at all); it is
  set instead to a multiple of the sky's own horizontal irradiance,
  measured from the HDRI (6x by default: a clear day's sun to sky).
- A voile that is cloth. The sheer (role "sheer") glows in the live
  view to stand in for the light behind it; here most of the light goes
  straight through it and the rest scatters, both ways.

Each camera asked for is rendered to linear EXR, then developed to a
PNG the way the studio draws: an exposure in stops (metered so the
room's median sits at 0.18, plus --stops), Khronos PBR Neutral, sRGB.
A camera's lens shift (extras "shift", a share of the frame's height,
down) is put back, so the Corner frame matches the studio's pixel for
pixel and tools/compare-refs.mjs can set them side by side.

Arguments (after `--` when run inside Blender):
  --glb PATH       the exported room (required)
  --out DIR        where the EXRs and PNGs go (default refs/)
  --cameras LIST   comma-separated camera names, or "all" (default Corner)
  --samples N      Cycles samples (default 256)
  --size WxH       the picture size (default 1440x900, the studio's)
  --sky PATH       the outdoor HDRI (default tools/blender/sky/city.exr)
  --sun-ratio F    the sun as a multiple of the sky's horizontal
                   irradiance (default 6)
  --sun W          the sun's irradiance in W/m2, overriding --sun-ratio
  --sheer F        the share of light through the voile untouched (0.55)
  --stops F        stops over the metered exposure (default +1)
  --cpu            the CPU even when a GPU is there
"""

import argparse
import math
import os
import struct
import sys
import zlib

import bpy  # type: ignore[import-not-found]
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SKY = os.path.join(HERE, "sky", "city.exr")
# the real sun's disc, radians (0.53 degrees)
SUN_ANGLE = math.radians(0.53)
# where a camera's meter puts the room's middle grey, scene-linear
MIDDLE_GREY = 0.18
# Rec. 709 luminance
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
# the Corner frame's window glass and the wall beside it, in the
# 1440 x 900 frame (tools/compare-refs.mjs measures the same boxes)
CORNER = {"window": (890, 170, 1130, 335), "wall": (1250, 110, 1340, 360)}


def args_given() -> list[str]:
    argv = sys.argv
    return argv[argv.index("--") + 1 :] if "--" in argv else argv[1:]


def parse() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Cycles reference renders of a studio room")
    p.add_argument("--glb", required=True)
    p.add_argument("--out", default="refs/")
    p.add_argument("--cameras", default="Corner")
    p.add_argument("--samples", type=int, default=256)
    p.add_argument("--size", default="1440x900")
    p.add_argument("--sky", default=SKY)
    p.add_argument("--sun-ratio", type=float, default=6.0)
    p.add_argument("--sun", type=float, default=None)
    p.add_argument("--sheer", type=float, default=0.55)
    p.add_argument("--stops", type=float, default=1.0)
    p.add_argument("--cpu", action="store_true")
    return p.parse_args(args_given())


def role(o) -> str | None:
    """what a part is, from the exporter's extras (custom properties)"""
    r = o.get("role")
    return str(r) if r else None


def import_room(path: str) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)


def hide_outside() -> int:
    """the outside planes: an opaque glowing picture past the glass"""
    n = 0
    for o in bpy.context.scene.objects:
        # an older export has no roles: its planes are named so
        if role(o) == "outside" or (role(o) is None and o.name.startswith("Window outside")):
            o.hide_render = True
            n += 1
    return n


def principled(m):
    return next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m and m.node_tree else None


def make_sheer(m, through: float) -> None:
    """a voile: `through` of the light passes untouched, the rest is
    scattered by the weave, back into the room and on through it"""
    p = principled(m)
    colour = tuple(p.inputs["Base Color"].default_value) if p else (0.92, 0.91, 0.89, 1)
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    cloth = nt.nodes.new("ShaderNodeBsdfDiffuse")
    cloth.inputs["Color"].default_value = colour
    back = nt.nodes.new("ShaderNodeBsdfTranslucent")
    back.inputs["Color"].default_value = colour
    weave = nt.nodes.new("ShaderNodeMixShader")  # front and back scatter
    weave.inputs["Fac"].default_value = 0.6
    nt.links.new(cloth.outputs[0], weave.inputs[1])
    nt.links.new(back.outputs[0], weave.inputs[2])
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = through
    nt.links.new(weave.outputs[0], mix.inputs[1])
    nt.links.new(clear.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])


def sheers(through: float) -> int:
    done = set()
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or role(o) != "sheer":
            continue
        for slot in o.material_slots:
            if slot.material and slot.material.name not in done:
                make_sheer(slot.material, through)
                done.add(slot.material.name)
    return len(done)


def sky_irradiance(image) -> float:
    """the sky's irradiance on a level surface, W/m2: its radiance over
    the upper half of the equirectangular picture, each pixel by the
    cosine of its height from the zenith and the solid angle it spans"""
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    rgb = px.reshape(h, w, 4)[..., :3]  # rows run bottom to top
    lum = rgb @ LUMA
    elev = ((np.arange(h) + 0.5) / h - 0.5) * math.pi
    up = elev > 0
    weight = np.sin(elev[up]) * np.cos(elev[up]) * (math.pi / h) * (2 * math.pi / w)
    return float((lum[up].sum(axis=1) * weight).sum())


def set_world(sky: str):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Outdoor sky")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.abspath(sky))
    bg = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return env.image


def set_sun(irradiance: float) -> int:
    n = 0
    for o in bpy.context.scene.objects:
        if o.type == "LIGHT" and o.data.type == "SUN":
            o.data.energy = irradiance
            o.data.angle = SUN_ANGLE
            n += 1
    return n


def set_cycles(samples: int, size: str, cpu: bool) -> tuple[int, int]:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 4
    scene.cycles.transparent_max_bounces = 16
    scene.cycles.device = "CPU"
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
    w, h = (int(v) for v in size.lower().split("x"))
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    # linear out: the exposure and the tone mapping are the PNG's
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    return w, h


def shift_lens(cam, w: int, h: int) -> None:
    """the studio's shift lens: the frame moved down `shift` of its
    height; Blender's shift is a share of the sensor's fitted side and
    up is positive"""
    shift = float(cam.get("shift", 0) or 0)
    if not shift:
        return
    fit = cam.data.sensor_fit
    side = h if fit == "VERTICAL" or (fit == "AUTO" and h > w) else w
    cam.data.shift_y = -shift * h / side


def pbr_neutral(c: np.ndarray) -> np.ndarray:
    """Khronos PBR Neutral, as three.js's NeutralToneMapping"""
    start, desat = 0.8 - 0.04, 0.15
    x = c.min(-1, keepdims=True)
    off = np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    c = c - off
    peak = c.max(-1, keepdims=True)
    d = 1 - start
    new_peak = 1 - d * d / (peak + d - start)
    scaled = c * np.where(peak > 0, new_peak / np.maximum(peak, 1e-6), 1)
    g = 1 - 1 / (desat * (peak - new_peak) + 1)
    out = scaled * (1 - g) + new_peak * g
    return np.where(peak < start, c, out)


def metered(rgb: np.ndarray) -> float:
    """stops that put the room's median at middle grey, the window's
    brightest 2 % left out, as a camera's meter does"""
    lum = rgb @ LUMA
    m = float(np.median(lum[lum < np.percentile(lum, 98)]))
    return math.log2(MIDDLE_GREY / max(m, 1e-6))


def write_png(path: str, srgb: np.ndarray) -> None:
    h, w, _ = srgb.shape
    rows = (np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8)
    raw = b"".join(b"\x00" + rows[y].tobytes() for y in range(h))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 6)))
        f.write(chunk(b"IEND", b""))


def box_mean(lum: np.ndarray, box: tuple[int, int, int, int]) -> float:
    h, w = lum.shape
    x0, y0, x1, y1 = box
    return float(lum[round(y0 * h / 900) : round(y1 * h / 900), round(x0 * w / 1440) : round(x1 * w / 1440)].mean())


def read_exr(exr: str) -> np.ndarray:
    """a linear render as rows top to bottom of RGB"""
    image = bpy.data.images.load(exr)
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    bpy.data.images.remove(image)
    return np.nan_to_num(px.reshape(h, w, 4)[::-1, :, :3], nan=0.0, posinf=0.0)


def develop(rgb: np.ndarray, png: str, stops: float) -> float:
    """the linear render to a PNG: metered exposure plus `stops`, PBR
    Neutral, sRGB; returns the exposure used"""
    ev = metered(rgb) + stops
    t = np.clip(pbr_neutral(rgb * 2.0**ev), 0, 1)
    s = np.where(t <= 0.0031308, 12.92 * t, 1.055 * np.power(t, 1 / 2.4) - 0.055)
    write_png(png, s)
    return ev


def main() -> None:
    a = parse()
    import_room(a.glb)
    print(f"reference: {hide_outside()} outside planes hidden, {sheers(a.sheer)} sheer materials made cloth")
    sky = set_world(a.sky)
    e = sky_irradiance(sky)
    sun = a.sun if a.sun is not None else a.sun_ratio * e
    print(f"reference: sky {os.path.basename(a.sky)}, {e:.2f} W/m2 on a level surface; sun {sun:.1f} W/m2 ({sun / max(e, 1e-6):.1f}x)")
    if not set_sun(sun):
        print("reference: the .glb carries no sun")
    w, h = set_cycles(a.samples, a.size, a.cpu)
    os.makedirs(a.out, exist_ok=True)
    scene = bpy.context.scene
    cams = [o for o in scene.objects if o.type == "CAMERA"]
    wanted = None if a.cameras == "all" else {n.strip() for n in a.cameras.split(",")}
    cams = [c for c in cams if wanted is None or c.name in wanted]
    if not cams:
        print("reference: none of the cameras asked for is in the .glb; export it from the studio")
        return
    for cam in cams:
        shift_lens(cam, w, h)
        scene.camera = cam
        name = cam.name.lower().replace(" ", "-")
        exr = os.path.abspath(os.path.join(a.out, f"{name}.exr"))
        scene.render.filepath = exr
        print(f"reference: rendering {cam.name} -> {exr}", flush=True)
        bpy.ops.render.render(write_still=True)
        png = os.path.join(a.out, f"{name}.png")
        rgb = read_exr(exr)
        ev = develop(rgb, png, a.stops)
        print(f"reference: {png} at {ev:+.2f} stops (metered {ev - a.stops:+.2f}, then {a.stops:+.1f})")
        if cam.name == "Corner":
            # the window over the wall in light itself, before the
            # exposure and the tone mapping squeeze the window
            lum = rgb @ LUMA
            ratio = box_mean(lum, CORNER["window"]) / max(box_mean(lum, CORNER["wall"]), 1e-9)
            print(f"reference: Corner window/wall {ratio:.2f} in linear light")


if __name__ == "__main__":
    main()
