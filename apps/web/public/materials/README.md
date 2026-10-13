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
`parquet` (ambientCG WoodFloor050, 6 m a tile: the set has 64 strips
across a tile, so 6 m lays them about 94 mm wide, as real strip
parquet; at the 3.2 m it had before they were 50 mm, a fine stripe
that read as a printed pattern), `plaster` (ambientCG PaintedPlaster017,
2 m) and `cloth` (the SheenChair fabric from KhronosGroup/glTF-Sample-
Assets, 0.3 m), all CC0, resized to 1K; the ambientCG sets came by way
of Open3D's GitHub data release, since the studio's build sandbox
cannot reach ambientcg.com or polyhaven.com. `LICENSES.md` beside this
file lists each with what was changed.

Not listed, so the grown surface stands in: `tiles`, `vinyl` and
`concrete`. Two photographed floors wait under `optional/` (ambientCG
Tiles074 and Terrazzo018): both are loud patterns for an HDB default,
so they are not switched on. To use one, move its folder up to
`public/materials/tiles/` and add a `tiles` entry to `index.json` with
a tile of 1.2.

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
