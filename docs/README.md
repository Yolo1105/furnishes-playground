# Docs

What is here, and where it came from.

- `DEPLOY.md`: how to put the studio on Vercel with Neon behind it, what
  each provider needs, and what to check after a deploy.

- `product-brief.zh.md`: the master planning document in Chinese from the
  discussion of 2 October 2026 ("Furnishes 软件与服务全量规划"), covering
  the business and product boundary, the service chain, the studio, Eva,
  projects, buying, and the six reference products studied. It records
  what was decided, what exists, what was assumed and what is still open,
  as of that date; it is not a promise of what the studio does today.
- `research/`: five research notes from the same date, each with its
  sources and its reasoning marked apart, on what a realistic interior
  viewer in three.js can draw on:
  - `dynamic_room_lighting.md`: indirect light for rooms made on the fly
    (real-time GI, server bakes, in-browser bakes).
  - `furniture_model_sources.md`: where realistic furniture models can be
    had that may legally ship in a commercial web app.
  - `image_to_3d_models.md`: image-to-3D models on fal.ai for single
    pieces, with prices, times and formats.
  - `photo_rendering_and_licences.md`: photo-quality stills (browser path
    tracing against server Cycles) and the licences of the reference
    repositories.
  - `webgpu_availability.md`: where WebGPU ships, and what three.js's
    WebGPU renderer falls back to.

The studio's own README at the repository root says what is built and
how to run it.
