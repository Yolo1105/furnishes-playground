# Photographed materials

The studio grows its wood, cloth, plaster and floors from noise when
nothing is here. A photographed set listed in `index.json` takes the
place of the grown one the moment it arrives, with no code change.

A set is a folder named for the material it stands in for, with three
images that tile seamlessly: the colour (sRGB), the normal map (OpenGL
convention, green up) and the roughness map (white rough, black
smooth). `index.json` names each set's files and the stretch in
metres one tile covers:

```json
{
  "materials": {
    "wood": {
      "tile": 1.0,
      "color": "color.jpg",
      "normal": "normal.jpg",
      "roughness": "roughness.jpg"
    }
  }
}
```

The names the studio looks for: `wood` (every panel's veneer, tinted
by the piece's colour), `cloth` (seats and cushions), `plaster` (the
walls) and the floors `parquet`, `vinyl`, `tiles`, `concrete`.

Two tint paths, which decide how a set's colour map must be made:

- A piece's finish (`finish.tsx`, `Mat`) multiplies the map by the
  piece's own colour in full, as it does the grown wood. So `wood` and
  `cloth` must be light grain values (an average luminance well above
  0.75, near white), or every piece is tinted twice and birch comes out
  walnut. The loader warns in development when a set here is too dark.
- A room surface (`Room3D.tsx`, the walls and floors) lays the Room
  tab's tone over the set lightly (`tintOver`, `TINT` 0.3), so `plaster`
  and the floors carry their own colour; the plaster here is near-white
  so a wall colour still reads.

What is in: `wood` (ambientCG Wood049, 1.2 m a tile, so its figure
runs at the scale of a real birch face rather than a fine stripe),
`plaster` (ambientCG PaintedPlaster017, 2 m) and `cloth` (the
SheenChair fabric from KhronosGroup/glTF-Sample-Assets, 0.3 m), all
CC0, resized to 1K; the ambientCG sets came by way of Open3D's GitHub
data release, since the studio's build sandbox cannot reach
ambientcg.com or polyhaven.com. `LICENSES.md` beside this file lists
each with what was changed.

Not listed, so the grown surface stands in: `parquet`, `tiles`, `vinyl`
and `concrete`. The photographed parquet (ambientCG WoodFloor050) waits
under `optional/parquet/`: its own colour is a dark olive-brown, and
the floor's tone goes over a photograph only by multiplying
(`tintOver`), which can darken it but never lighten it, so the warm
honey floor the arrangements ask for (`#c59b6b`) came out a muddy dark
brown that the owner found ugly; the grown parquet is painted in the
floor's own tone instead. To use it again, move its folder up and add
a `parquet` entry to `index.json` with a tile of 6.0 (the set has 64
strips across a tile, so 6 m lays them about 94 mm wide). Two
photographed floors wait under `optional/` too (ambientCG Tiles074 and
Terrazzo018): both are loud patterns for an HDB default, so they are
not switched on. To use one, move its folder up to
`public/materials/tiles/` and add a `tiles` entry to `index.json` with
a tile of 1.2.

## Round 10, Part 1: the downloads the bookcase proof waits on

The proof (one 800 × 2000 × 400 mm birch bookcase, rasterised and path
traced, for a blind test) is built from scanned sets only. The build
sandbox cannot reach polyhaven.com or ambientcg.com (checked 2026-10-17:
both refuse the connection), so these come from the owner. Put them
exactly here, with these names, and the proof can start:

1. **Birch face: Poly Haven `plywood`** (CC0), https://polyhaven.com/a/plywood,
   resolution **4K**, format **JPG** (the glTF/ARM pack is fine too).
   Into `scan/birch-face/`:
   - `color.jpg` ← `plywood_diff_4k.jpg` (sRGB)
   - `normal.jpg` ← `plywood_nor_gl_4k.jpg` (the **GL** normal, not DX)
   - `roughness.jpg` ← `plywood_rough_4k.jpg`
   - `arm.jpg` ← `plywood_arm_4k.jpg` (if the ARM pack was taken; its AO
     channel is not used, the piece's own bake is the one AO)
   - a note of the real-world width Poly Haven gives on the asset page
     (the brief has it as 0.5 m; the UVs are set from it).
2. **Birch edge: ambientCG `Wood087`** (CC0, "Plywood Side"),
   https://ambientcg.com/view?id=Wood087, **2K-JPG**. Into
   `scan/birch-edge/`:
   - `color.jpg` ← `Wood087_2K-JPG_Color.jpg`
   - `normal.jpg` ← `Wood087_2K-JPG_NormalGL.jpg`
   - `roughness.jpg` ← `Wood087_2K-JPG_Roughness.jpg`
3. **A studio HDRI: nothing to download.** `public/sky/studio.hdr` is
   Poly Haven's *Studio Small 03* (CC0, see `public/sky/LICENSES.md`);
   the proof's studio view uses it unless a softer one is wanted.
4. **One real product photo** for the side-by-side: a Furnishes
   birch-ply bookcase or shelf (any angle near 45°, daylight or
   studio). Put it at `scan/reference/bookcase.jpg`; it is only read for
   the comparison sheet and is not committed unless the owner says so.
5. **Nothing for the handle:** a CC0 handle glTF can be fetched from
   GitHub by the sandbox.

Then say "go" (or re-run the round 10 prompt). The proof stops after the
four images and the side-by-side, for the 5-second blind test by 3–5
people; nothing in Parts 2–7 starts before its result.

## Owner tasks: the sets only a camera can make

Three surfaces are still grown in the shader because no free scan
matches them closely enough. Each wants a photograph, taken once:

- `birch-face`: a sheet of the birch plywood the Furnishes pieces are
  cut from, the face veneer (rotary cut, the long wavy figure).
- `birch-edge`: a cut edge of the same sheet, square on, so the 13
  plies and the glue lines between them show (`ply.ts` grows them now).
- `linen`: the linen the sofas and the lamp shade are covered in, flat
  and unstretched.
- (optional) the lacquer: a lacquered panel at a low angle to a window,
  so its sheen and the faint orange-peel of the coat show; this tunes
  `LACQUER_ROUGH` and `LACQUER_COAT` in `finish.tsx` rather than making
  a set.

How to take them: even daylight, overcast or a north window, no sun
patches and no flash; the camera square to the surface; a ruler in
frame (cropped out later) so the tile size is known; at least
3000 px across a 0.6–1 m patch for the faces, a 0.3 m patch for the
linen. Shoot RAW or the camera's best JPEG with a fixed white balance.

How to make a set: crop away the ruler and any falloff, then make the
image tile and derive the maps in Materialize (free) or Adobe Substance
3D Sampler (colour, normal in OpenGL convention, roughness). Resize to
1K (2K for the face if it is the hero surface), save as `color.jpg`,
`normal.jpg`, `roughness.jpg` in a folder named `birch-face`,
`birch-edge` or `linen` here, add an entry to `index.json` with the
tile the ruler gave, and a line to `LICENSES.md` (your own photograph,
the licence you choose). The colour map follows the tint rule above:
`birch-face` and `linen` are tinted by the piece's colour, so make them
light; `birch-edge` is shown as photographed.
