/**
 * useAvatarControls.ts
 *
 * Manages avatar rotation (auto + gesture) and raycasting (touch → mesh detection).
 * Keeps Three.js logic in refs, outside React render cycle.
 */

import { useRef, useCallback } from 'react';
import * as THREE from 'three';

interface AvatarControlsConfig {
  autoRotateSpeed?: number; // radians per frame, default ~0.005
}

interface RaycastResult {
  meshName: string;
  point: THREE.Vector3;
}

export function useAvatarControls(config: AvatarControlsConfig = {}) {
  const { autoRotateSpeed = 0.005 } = config;

  const modelRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshMapRef = useRef<Record<string, THREE.Mesh>>({});
  const autoRotateRef = useRef(true);
  const selectedMeshRef = useRef<string | null>(null);
  const originalMaterialsRef = useRef<Record<string, { color: THREE.Color; emissive: THREE.Color }>>({});

  // Raycaster (reused, no alloc per frame)
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());

  /**
   * Register the loaded model and index its meshes by name.
   */
  const registerModel = useCallback((model: THREE.Group) => {
    modelRef.current = model;
    const map: Record<string, THREE.Mesh> = {};
    const originals: Record<string, { color: THREE.Color; emissive: THREE.Color }> = {};

    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const name = mesh.name;
        if (name) {
          // Clone material so each mesh has its own instance
          mesh.material = (mesh.material as THREE.Material).clone();
          map[name] = mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          originals[name] = {
            color: mat.color.clone(),
            emissive: mat.emissive.clone(),
          };
        }
      }
    });

    meshMapRef.current = map;
    originalMaterialsRef.current = originals;
  }, []);

  /**
   * Called each animation frame. Rotates model if autoRotate is on.
   */
  const onFrame = useCallback(() => {
    if (autoRotateRef.current && modelRef.current) {
      modelRef.current.rotation.y += autoRotateSpeed;
    }
  }, [autoRotateSpeed]);

  /**
   * Perform raycasting from a touch position on the GLView.
   * Returns the name of the hit mesh, or null.
   */
  const raycast = useCallback((
    touchX: number,
    touchY: number,
    viewWidth: number,
    viewHeight: number
  ): RaycastResult | null => {
    if (!cameraRef.current || !modelRef.current) return null;

    // Convert touch to normalized device coordinates (-1 to 1)
    pointerRef.current.x = (touchX / viewWidth) * 2 - 1;
    pointerRef.current.y = -(touchY / viewHeight) * 2 + 1;

    raycasterRef.current.setFromCamera(pointerRef.current, cameraRef.current);

    const meshes = Object.values(meshMapRef.current);
    const intersects = raycasterRef.current.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const meshName = hit.object.name;
      return { meshName, point: hit.point };
    }
    return null;
  }, []);

  /**
   * Highlight a mesh by name. Clears previous highlight.
   */
  const highlight = useCallback((meshName: string | null) => {
    // Clear previous
    if (selectedMeshRef.current) {
      const prevMesh = meshMapRef.current[selectedMeshRef.current];
      const orig = originalMaterialsRef.current[selectedMeshRef.current];
      if (prevMesh && orig) {
        const mat = prevMesh.material as THREE.MeshStandardMaterial;
        mat.color.copy(orig.color);
        mat.emissive.copy(orig.emissive);
      }
    }

    selectedMeshRef.current = meshName;

    // Apply highlight
    if (meshName) {
      const mesh = meshMapRef.current[meshName];
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.set(0x3388ff);
        mat.emissiveIntensity = 0.4;
      }
    }
  }, []);

  /**
   * Toggle auto-rotation.
   */
  const setAutoRotate = useCallback((enabled: boolean) => {
    autoRotateRef.current = enabled;
  }, []);

  return {
    modelRef,
    cameraRef,
    meshMapRef,
    registerModel,
    onFrame,
    raycast,
    highlight,
    setAutoRotate,
    selectedMesh: selectedMeshRef,
  };
}
