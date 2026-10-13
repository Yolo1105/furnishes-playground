# The view out of the windows: a photographed backplate (to install)

What a window shows today is drawn: the studio's light panels, or one
of the small Poly Haven skies in this folder (`LICENSES.md`), all
512 × 256. Seen through a window at eye level that is soft and a
little flat: there is no near and far, nothing moves as you walk past,
and a 512-pixel sky is a few pixels across a window.

A real view wants a photographed backplate: an equirectangular HDR at
least 4K wide (8K is better), taken at the height of a mid-floor HDB
flat or near it, with a near layer (trees, a block across the road)
and a far one (the sky, distant blocks), so it moves against the
window frames as the camera walks past (parallax) and stays much
brighter than the room, with its sun where the studio's sun is.

The build sandbox could not reach polyhaven.com (blocked by its
network policy), so the files are listed here for the owner to fetch.

## Files to download

All CC0 from Poly Haven; take the `.hdr` at the size named and keep the
original name with the size, so the licence line can name it.

| Use              | Poly Haven asset (slug)                | Size | Why                                                                      |
| ---------------- | -------------------------------------- | ---- | ------------------------------------------------------------------------ |
| Day, the default | `urban_courtyard_02` (or `courtyard`)  | 4K   | blocks and trees at mid-distance, an overcast-bright sky: an HDB outlook |
| Day, a sunny one | `kloofendal_48d_partly_cloudy_puresky` | 4K   | the sky alone, a high sun; for a top-floor flat with open views          |
| Evening          | `dikhololo_night` (already here, 1K)   | 4K   | the same night sky, sharp enough to see through a window                 |
| Dusk             | `venice_sunset` (already here, 1K)     | 4K   | the sunset look at a size that holds up in a window                      |

Slugs marked "or" are close alternatives; check the preview before
choosing: an outlook full of grass and no buildings reads as a country
house, not a flat in Singapore.

## How to install

1. Download each as `.hdr` at 4K from its Poly Haven page.
2. Keep the 4K file for the windows (the outlook) and make the small
   512 × 256 copy the room's lighting uses (the room is lit by the
   small one; a 4K map as the scene's environment costs memory for no
   gain): `npx @gltf-transform/cli` does not do HDRs, so use Blender
   (Image → Resize) or `pfstools`.
3. Put both here: `outlook-day-4k.hdr` and `outlook-day.hdr`, and so on.
4. Add a line each to `LICENSES.md`: the asset's Poly Haven URL, CC0,
   and what was changed (resized).
5. The window's view is drawn in the shader today (`OUTLOOK` in
   `Room3D.tsx`: a sky from zenith to horizon, a sun, a ground and a
   line of trees, linear light well above the room's). The backplate
   replaces that node: sample the 4K map along the view direction
   through the pane, with its near layer offset by the camera's
   position for the parallax, and turn the map so its sun stands where
   the studio's sun does (`sun-position.ts`).

Until then the windows show the drawn outlook: its sky, sun, ground
and trees, at the brightness the studio draws them, with no parallax.
