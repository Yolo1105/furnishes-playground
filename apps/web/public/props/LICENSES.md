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
