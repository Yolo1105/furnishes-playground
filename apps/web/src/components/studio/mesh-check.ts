import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { refuseMesh } from "./mesh-clean";
import { DRACO_PATH } from "./props-store";

/**
 * A generated mesh read once it arrives, before the item keeps it
 * (round 8, Part 3b): loaded apart from the room, and turned away when
 * it has holes or too coarse a picture for its size (mesh-clean.ts).
 * Loaded on its own, so the strip's code carries no loader until a mesh
 * is generated.
 */
export const checkMesh = async (url: string, longest: number) => {
  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  try {
    const gltf = await loader.loadAsync(url);
    return refuseMesh(gltf.scene, longest);
  } catch {
    return "it could not be read";
  } finally {
    // its decoder's workers go with it
    draco.dispose();
  }
};
