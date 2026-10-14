# Stock room items

Every model in this folder is from Poly Haven (https://polyhaven.com),
licensed CC0 (public domain), at 1k resolution. They stand in for a room
item made from a few words when no image or mesh provider is connected,
and the room's own items (a sofa, an armchair, a chair, a coffee table,
a plant, a vase, a desk lamp) are drawn from them, a seat's cloth taking
the item's colour over the model's own weave.

The models are Draco-compressed; the decoder under `public/draco` is
Google's Draco (Apache 2.0), served from here so nothing is fetched from
a third party at run time.

What was changed: the heavier models (the dining chair, the wicker basket,
the potted plant, the metal stool, the book set, the cardboard box, the
vase, the laptop, the desk lamp, the wooden cabinet and the planter box)
are simplified to about 6,000 triangles each, at most 0.5% of the model's
size out of place, with glTF Transform's `weld` and `simplify`
(meshoptimizer), then Draco-compressed again; the textures are as
published. A dining chair was 22,000 triangles, and a furnished flat
drew three quarters of its triangles in its stock items.

## Khronos glTF sample models (added 2026-10-14)

From KhronosGroup/glTF-Sample-Assets (https://github.com/KhronosGroup/glTF-Sample-Assets), folder `Models/<name>`.
What was changed in every file: the model's own KHR_lights_punctual light removed (the studio lights the room itself);
meshopt geometry compression; textures re-encoded as WebP at 2048 px at most. potted_plant_tall.glb is further welded and
simplified to about 12,000 triangles (from 68,000; glTF Transform's `weld` and `simplify`, meshoptimizer) with its textures
as WebP at 1024 px at most, the studio's model budget: 1.0 MB, from 4.2 MB.
The licences exclude logos and associated trademarks.

| File                   | Source model             | Licence               | Credit                                                                   |
| ---------------------- | ------------------------ | --------------------- | ------------------------------------------------------------------------ |
| glam_velvet_sofa.glb   | GlamVelvetSofa           | CC-BY-4.0             | Eric Chadwick, via Khronos glTF-Sample-Assets                            |
| leather_wood_sofa.glb  | SheenWoodLeatherSofa     | CC-BY-4.0 and CC0-1.0 | Eric Chadwick; Fran Calvente (CC0 parts), via Khronos glTF-Sample-Assets |
| sheen_chair.glb        | SheenChair               | CC0-1.0               | Eric Chadwick (no attribution required; given anyway)                    |
| chair_damask.glb       | ChairDamaskPurplegold    | CC-BY-4.0             | Eric Chadwick, via Khronos glTF-Sample-Assets                            |
| silk_pouf.glb          | SpecularSilkPouf         | CC-BY-4.0             | Eric Chadwick, via Khronos glTF-Sample-Assets                            |
| floor_lamp_arc.glb     | LightsPunctualLamp       | CC-BY-4.0             | DGG, via Khronos glTF-Sample-Assets                                      |
| glass_vase_flowers.glb | GlassVaseFlowers         | CC0-1.0               | Eric Chadwick; Rico Cilliers                                             |
| potted_plant_tall.glb  | DiffuseTransmissionPlant | CC-BY-4.0 and CC0-1.0 | Eric Chadwick; Rico Cilliers (CC0 parts), via Khronos glTF-Sample-Assets |

CC-BY-4.0 requires the credit above to be shown where the work is used: the studio's Help dialog lists it under
"3D model credits" (`MODEL_CREDITS`, help-data.ts).
