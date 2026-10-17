/** a mesh model's input, by its family: Hunyuan 3D (the default) takes
    one picture and a PBR switch; Hyper3D Rodin (round 10, Part 6: set
    FAL_MESH_FULL / FAL_MESH_RAPID to `fal-ai/hyper3d/rodin`) takes a
    list of pictures and asks for PBR materials and a GLB. Rodin's
    fields are as its documentation had them when written; the build
    sandbox cannot reach fal.ai, so the first live call is its check */
export const meshInput = (model: string, imageUrl: string) =>
  /rodin/i.test(model)
    ? {
        input_image_urls: [imageUrl],
        geometry_file_format: "glb",
        material: "PBR",
        quality: "medium",
      }
    : { input_image_url: imageUrl, enable_pbr: true };
