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
      "tile": 1.2,
      "color": "color.jpg",
      "normal": "normal.jpg",
      "roughness": "roughness.jpg"
    }
  }
}
```

The names the studio looks for: `wood` (every panel's veneer, tinted
by the piece's colour), `cloth` (seats and cushions), `plaster` (the
walls) and the floors `parquet`, `vinyl`, `tiles`, `concrete`. A
floor's set carries its own colour; the Room tab's tone is laid over
it lightly.

CC0 sets that fit, from ambientCG (https://ambientcg.com) or Poly
Haven (https://polyhaven.com), 1K is plenty: an oak veneer (ambientCG
Wood051 or Poly Haven `oak_veneer_01`) for `wood`; a linen weave
(ambientCG Fabric030) for `cloth`; a fine plaster (ambientCG
Plaster001) for `plaster`; a herringbone or strip parquet (ambientCG
WoodFloor051) for `parquet`; a wide board (ambientCG WoodFloor043) for
`vinyl`; a stone tile (ambientCG Tiles074) for `tiles`; and a concrete
screed (ambientCG Concrete034) for `concrete`. Add a line to
`LICENSES.md` beside this file for each set brought in. The studio's
build sandbox cannot reach either site, which is why the sets are not
here already.
