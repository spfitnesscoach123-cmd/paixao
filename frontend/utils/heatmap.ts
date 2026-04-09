/**
 * heatmap.ts
 * 
 * Applies color gradients to avatar meshes based on skinfold values.
 * Pure utility — no React dependency.
 */

import * as THREE from 'three';

// Thresholds for classification (mm)
const LOW_THRESHOLD = 10;
const MID_THRESHOLD = 20;
const HIGH_THRESHOLD = 30;

// Colors
const COLOR_LOW = new THREE.Color(0x22c55e);    // green
const COLOR_MID = new THREE.Color(0xeab308);    // yellow
const COLOR_HIGH = new THREE.Color(0xef4444);   // red
const COLOR_DEFAULT = new THREE.Color(0x8888aa); // neutral gray-blue

/**
 * Returns a color based on a skinfold value (mm).
 */
export function getHeatmapColor(value: number): THREE.Color {
  if (value <= LOW_THRESHOLD) {
    return COLOR_LOW.clone();
  }
  if (value <= MID_THRESHOLD) {
    const t = (value - LOW_THRESHOLD) / (MID_THRESHOLD - LOW_THRESHOLD);
    return COLOR_LOW.clone().lerp(COLOR_MID, t);
  }
  if (value <= HIGH_THRESHOLD) {
    const t = (value - MID_THRESHOLD) / (HIGH_THRESHOLD - MID_THRESHOLD);
    return COLOR_MID.clone().lerp(COLOR_HIGH, t);
  }
  return COLOR_HIGH.clone();
}

/**
 * Applies heatmap colors to named meshes in a Three.js scene.
 * 
 * @param meshMap - Record of mesh name → THREE.Mesh
 * @param values  - Record of mesh name → value in mm
 */
export function applyHeatmap(
  meshMap: Record<string, THREE.Mesh>,
  values: Record<string, number>
): void {
  for (const [meshName, mesh] of Object.entries(meshMap)) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat) continue;

    const value = values[meshName];
    if (value !== undefined) {
      mat.color.copy(getHeatmapColor(value));
      mat.emissive.set(0x000000);
    } else {
      mat.color.copy(COLOR_DEFAULT);
      mat.emissive.set(0x000000);
    }
  }
}

/**
 * Resets all meshes to default neutral color.
 */
export function clearHeatmap(meshMap: Record<string, THREE.Mesh>): void {
  for (const mesh of Object.values(meshMap)) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat) continue;
    mat.color.copy(COLOR_DEFAULT);
    mat.emissive.set(0x000000);
  }
}

/**
 * Anatomical site → mesh names mapping.
 * Used to translate protocol sites to actual 3D meshes.
 */
export const ANATOMICAL_MAP: Record<string, string[]> = {
  triceps: ['LeftArm', 'RightArm'],
  biceps: ['LeftArm', 'RightArm'],
  subscapular: ['Torso'],
  suprailiac: ['Torso'],
  abdominal: ['Torso'],
  chest: ['Torso'],
  midaxillary: ['Torso'],
  thigh: ['LeftLeg', 'RightLeg'],
  calf: ['LeftLeg', 'RightLeg'],
};
