/** what a generated object is mostly made of, as Claude reads its
    picture (api/generate-item): the studio's material for it takes the
    place of the generated one, the generated colour kept as its tint */
export const STUDIO_MATERIALS = {
  fabric: { roughness: 0.92, metalness: 0, sheen: 0.6 },
  leather: { roughness: 0.55, metalness: 0, sheen: 0.15 },
  wood: { roughness: 0.62, metalness: 0, sheen: 0 },
  metal: { roughness: 0.35, metalness: 0.85, sheen: 0 },
  glass: { roughness: 0.08, metalness: 0, sheen: 0 },
  ceramic: { roughness: 0.3, metalness: 0, sheen: 0 },
  plant: { roughness: 0.7, metalness: 0, sheen: 0.25 },
} as const;
export type StudioMaterial = keyof typeof STUDIO_MATERIALS;
export const STUDIO_MATERIAL_NAMES = Object.keys(
  STUDIO_MATERIALS,
) as StudioMaterial[];
