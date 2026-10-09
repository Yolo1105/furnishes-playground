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

What is in: `wood` (ambientCG Wood049, 1 m a tile), `parquet`
(ambientCG WoodFloor050, 2 m), `plaster` (ambientCG PaintedPlaster017,
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
