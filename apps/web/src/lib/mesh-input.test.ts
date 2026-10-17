import { describe, expect, it } from "vitest";
import { meshInput } from "./mesh-input";

describe("a mesh model's input (round 10, Part 6)", () => {
  it("keeps Hunyuan 3D's as it was", () => {
    expect(meshInput("fal-ai/hunyuan-3d/v3.1/pro/image-to-3d", "u")).toEqual({
      input_image_url: "u",
      enable_pbr: true,
    });
  });
  it("asks Rodin for PBR materials and a GLB", () => {
    const i = meshInput("fal-ai/hyper3d/rodin", "u");
    expect(i).toMatchObject({
      input_image_urls: ["u"],
      material: "PBR",
      geometry_file_format: "glb",
    });
  });
});
