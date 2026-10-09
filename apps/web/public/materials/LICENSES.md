# Materials

The photographed sets here are each CC0 1.0 (public domain), so no
attribution is required; it is given anyway. Add a line for each set
brought in, with its source, its licence and what was changed. Where
no set is listed in `index.json` (tiles, vinyl, concrete) the studio
grows the surface from noise (`src/components/studio/surface-paint.ts`,
the studio's own work).

- `wood/`: ambientCG Wood049, CC0 1.0, https://ambientcg.com/view?id=Wood049, via Open3D's data release (github.com/isl-org/open3d_downloads, 20220301-data); resized to 1K, normal map converted from DirectX to OpenGL, colour map turned to light grain values (as the studio's grown wood is), so each piece's own colour carries the hue.
- `parquet/`: ambientCG WoodFloor050, CC0 1.0, https://ambientcg.com/view?id=WoodFloor050, via Open3D's data release (github.com/isl-org/open3d_downloads, 20220301-data); resized to 1K, normal map converted from DirectX to OpenGL.
- `optional/tiles/` (not listed in index.json): ambientCG Tiles074, CC0 1.0, https://ambientcg.com/view?id=Tiles074, via Open3D's data release (github.com/isl-org/open3d_downloads, 20220301-data); resized to 1K, normal map converted from DirectX to OpenGL.
- `plaster/`: ambientCG PaintedPlaster017, CC0 1.0, https://ambientcg.com/view?id=PaintedPlaster017, via Open3D's data release (github.com/isl-org/open3d_downloads, 20220301-data); resized to 1K, normal map converted from DirectX to OpenGL, colour map lifted to an off-white paint so the room's wall colour still reads, normal map softened to 40% (roughness map derived from the colour map here).
- `cloth/`: the fabric maps of the SheenChair model by Eric Chadwick, CC0 1.0, from KhronosGroup/glTF-Sample-Assets (Models/SheenChair); resized to 1K, colour lifted to light values so each piece's own colour carries the hue, roughness derived from the colour map here.

- `optional/terrazzo/`: ambientCG Terrazzo018, CC0 1.0, https://ambientcg.com/view?id=Terrazzo018, via Open3D's data release; resized to 1K, normal map converted from DirectX to OpenGL (not listed in index.json).

Not listed, so the grown surface stands in: `tiles`, `vinyl`, `concrete`. To use an optional floor, move its folder up to `public/materials/tiles/` and add a `tiles` entry to index.json with a tile of 1.2.
