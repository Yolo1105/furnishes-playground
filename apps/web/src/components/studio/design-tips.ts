/**
 * What each kept style asks for, in a line or two drawn from Eva's design
 * documents: what to do, what to avoid, where the money goes. Shown under
 * the Design style block and read by the rule brain. Styles the documents
 * do not cover carry no tip rather than an invented one.
 */
export type Tip = { do: string; dont: string; budget: string };

export const DESIGN_TIPS: Partial<Record<string, Tip>> = {
  Japandi: {
    do: "Low, horizontal silhouettes; one wood plus one accent; closed storage hides clutter; leave the coffee table mostly clear.",
    dont: "Many wood tones, bright primaries, heavy ornament, or a knit on every surface.",
    budget:
      "Spend on the sofa or bed and one wood storage piece; lighting and ceramics can come later.",
  },
  Scandinavian: {
    do: "Pale matte woods (birch, ash, light oak), sheer curtains, layered wool and linen, simple silhouettes, a plant or two.",
    dont: "Dark walnut everywhere, heavy drapes, high gloss, or hard black-and-white as the only language.",
    budget:
      "Invest in sofa comfort and daylight control; plants and textiles stretch the look cheaply.",
  },
  "Mid-century": {
    do: "Tapered legs and visible structure, one dominant wood (walnut, teak or oak), a credenza, one sculptural light, a rug that catches the front legs.",
    dont: "Skirted sofas, heavy drapery, five wood tones, or chrome kitsch except as a deliberate accent.",
    budget:
      "Spend on the sofa and one wood case piece first; lamps and side tables can be phased.",
  },
  Industrial: {
    do: "Metal with wood (steel bases, wood tops, pipe shelving), warm dimmable lighting, charcoal, rust and brown with leather and canvas, long sightlines.",
    dont: "Faux brick on every wall, pastel shabby finishes, five metal finishes, or a room left cold and echoey.",
    budget:
      "Prioritise a strong table or sofa and good lighting; open shelving is cheaper than cabinets but needs editing.",
  },
  Coastal: {
    do: "Sand, white, soft blue and driftwood grey; light wood, rattan, linen, jute; sheer curtains and uncluttered window walls.",
    dont: "Nautical motifs as the decoration, dark heavy furniture, cold blue-grey with no warm sand, glossy yacht finishes.",
    budget:
      "Invest in the sofa and the window sheers; rattan accents and jute rugs stretch the look.",
  },
};
