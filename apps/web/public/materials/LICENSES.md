# Materials

The photographed sets here are each CC0 1.0 (public domain), so no
attribution is required; it is given anyway. Add a line for each set
brought in, with its source, its licence and what was changed. Where
no set is listed in `index.json` (tiles, vinyl, concrete) the studio
grows the surface from noise (`src/components/studio/surface-paint.ts`,
the studio's own work).

- `wood/`: ambientCG Wood049, CC0 1.0, https://ambientcg.com/view?id=Wood049, via Open3D's data release (github.com/isl-org/open3d_downloads, 20220301-data); resized to 1K, normal map converted from DirectX to OpenGL, colour map turned to light grain values (as the studio's grown wood is), so each piece's own colour carries the hue; then (2026-10-13) its grain spread out (the 2nd to 99.5th percentile mapped to 0.50–0.97, mean 0.80) with the darker latewood a shade warmer, since at ±6 % the grain under a piece's colour read as a flat painted sheet. Then (2026-10-16) calmed half-way back: each value's distance from the mean times 0.55 about a mean of 0.83 (sd 0.075, 0.62–0.96), and laid at 0.75 m a tile (index.json) so its rings come at about 9 mm and not 15, since at sd 0.137 and 1.2 m a tile every board read as a cartoon of rustic brushed pine.
- `optional/parquet/` (not listed in index.json since 2026-10-14): ambientCG WoodFloor050, CC0 1.0, https://ambientcg.com/view?id=WoodFloor050, via Open3D's data release (github.com/isl-org/open3d_downloads, 20220301-data); resized to 1K, normal map converted from DirectX to OpenGL; colour map (2026-10-13) with each strip's own tone pulled 80 % of the way to the floor's (the map less its blurred self, the grain inside each strip kept), since the strips' light and dark read as a cartoon floor.
- `optional/tiles/` (not listed in index.json): ambientCG Tiles074, CC0 1.0, https://ambientcg.com/view?id=Tiles074, via Open3D's data release (github.com/isl-org/open3d_downloads, 20220301-data); resized to 1K, normal map converted from DirectX to OpenGL.
- `plaster/`: ambientCG PaintedPlaster017, CC0 1.0, https://ambientcg.com/view?id=PaintedPlaster017, via Open3D's data release (github.com/isl-org/open3d_downloads, 20220301-data); resized to 1K, normal map converted from DirectX to OpenGL, colour map lifted to an off-white paint so the room's wall colour still reads, normal map softened to 40% (roughness map derived from the colour map here).
- `cloth/`: the fabric maps of the SheenChair model by Eric Chadwick, CC0 1.0, from KhronosGroup/glTF-Sample-Assets (Models/SheenChair); resized to 1K, colour lifted to light values so each piece's own colour carries the hue, roughness derived from the colour map here; low-frequency variation removed (high-pass), keeping the fine weave (each map less a 12 px Gaussian blur of itself, wrapped as the tile repeats, plus its mean; the normal map's blue set to full), so a sofa reads as plain linen and not as a blotchy pattern.

- `optional/terrazzo/`: ambientCG Terrazzo018, CC0 1.0, https://ambientcg.com/view?id=Terrazzo018, via Open3D's data release; resized to 1K, normal map converted from DirectX to OpenGL (not listed in index.json).

Not listed, so the grown surface stands in: `parquet`, `tiles`, `vinyl`, `concrete`. To use an optional floor, move its folder up to `public/materials/tiles/` and add a `tiles` entry to index.json with a tile of 1.2.
