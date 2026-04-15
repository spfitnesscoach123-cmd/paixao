/**
 * Avatar3D.tsx — Real GLB-based 3D avatar with heatmap, raycasting, and auto-rotation.
 *
 * Loads /assets/models/avatar.glb (AVATAR DC ULTIMATE) via GLTFLoader.
 * NO procedural fallback — if GLB fails, an explicit error is shown.
 *
 * Mesh names (from GLB): BICEPS, TRICEPS, PEITORAL, AXILAR_MEDIA,
 *   ABDOMINAL, SUPRA_ILIACA, COXA, PANTURILHA, SUBESCAPULAR
 *   + body base mesh (tripo_mesh_*)
 *
 * Each anatomical mesh maps 1:1 to a SkinfoldSite.
 */

import React, { useRef, useCallback, useEffect, useState, Component } from 'react';
import {
  View, Text, StyleSheet, Platform, ActivityIndicator,
} from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// ============================================================
// CONSTANTS
// ============================================================

const SKIN_COLOR = 0xc8a07e;
const AUTO_ROTATE_SPEED = 0.005; // radians per frame

/**
 * GLB mesh name → SkinfoldSite (protocol engine key).
 * The AVATAR DC ULTIMATE model has meshes named after anatomical sites.
 */
export const GLB_MESH_TO_SITE: Record<string, string> = {
  BICEPS: 'biceps',
  TRICEPS: 'triceps',
  PEITORAL: 'chest',
  AXILAR_MEDIA: 'midaxillary',
  ABDOMINAL: 'abdominal',
  SUPRA_ILIACA: 'suprailiac',
  COXA: 'thigh',
  PANTURILHA: 'calf',
  SUBESCAPULAR: 'subscapular',
};

/**
 * Anatomical body part labels (PT/EN) with corresponding SkinfoldSite.
 */
export const BODY_PARTS: Record<string, { pt: string; en: string; site: string }> = {
  BICEPS: { pt: 'Biceps', en: 'Biceps', site: 'biceps' },
  TRICEPS: { pt: 'Triceps', en: 'Triceps', site: 'triceps' },
  PEITORAL: { pt: 'Peitoral', en: 'Chest', site: 'chest' },
  AXILAR_MEDIA: { pt: 'Axilar Media', en: 'Midaxillary', site: 'midaxillary' },
  ABDOMINAL: { pt: 'Abdominal', en: 'Abdominal', site: 'abdominal' },
  SUPRA_ILIACA: { pt: 'Supra-iliaca', en: 'Suprailiac', site: 'suprailiac' },
  COXA: { pt: 'Coxa', en: 'Thigh', site: 'thigh' },
  PANTURILHA: { pt: 'Panturrilha', en: 'Calf', site: 'calf' },
  SUBESCAPULAR: { pt: 'Subescapular', en: 'Subscapular', site: 'subscapular' },
};

/** All 9 anatomical mesh names that MUST exist in the GLB */
const REQUIRED_MESHES = Object.keys(GLB_MESH_TO_SITE);

// Heatmap gradient stops
const HEAT_LOW = new THREE.Color(0x22c55e);
const HEAT_MID = new THREE.Color(0xeab308);
const HEAT_HIGH = new THREE.Color(0xef4444);

// ============================================================
// GLB BINARY UTILITIES
// ============================================================

/**
 * Parse the JSON chunk of a GLB to build a node-name → mesh-name map.
 * GLTFLoader assigns node names to Three.js objects, not mesh names.
 * This lets us rename meshes after loading.
 */
function parseGLBNameMap(buffer: ArrayBuffer): Record<string, string> {
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  const jsonBytes = new Uint8Array(buffer, 20, jsonLength);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes));

  const mapping: Record<string, string> = {};
  for (const node of json.nodes || []) {
    if (node.mesh !== undefined && node.name) {
      const meshName = json.meshes?.[node.mesh]?.name;
      if (meshName) {
        // Map node name to mesh name (BICEPS, TRICEPS, etc.)
        mapping[node.name] = meshName;
      }
    }
  }
  return mapping;
}

/**
 * Strip images/textures/samplers from a GLB ArrayBuffer so that
 * GLTFLoader.parse() never tries to decode images (which would crash
 * in React Native where createImageBitmap / HTMLImageElement is absent).
 * Geometry and materials (base colors) are preserved.
 */
function stripGLBTextures(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  const jsonBytes = new Uint8Array(buffer, 20, jsonLength);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes));

  // Remove all image / texture references
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const mat of json.materials || []) {
    const pbr = mat.pbrMetallicRoughness;
    if (pbr) {
      delete pbr.baseColorTexture;
      delete pbr.metallicRoughnessTexture;
    }
    delete mat.normalTexture;
    delete mat.occlusionTexture;
    delete mat.emissiveTexture;
  }

  // Encode new JSON
  const newJsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const paddedLen = (newJsonBytes.length + 3) & ~3; // 4-byte align

  // Binary chunk
  const binStart = 12 + 8 + jsonLength;
  const binLength = view.getUint32(binStart, true);
  const binData = new Uint8Array(buffer, binStart + 8, binLength);

  // Rebuild GLB
  const totalSize = 12 + 8 + paddedLen + 8 + binLength;
  const out = new ArrayBuffer(totalSize);
  const ov = new DataView(out);
  const oa = new Uint8Array(out);

  // Header
  ov.setUint32(0, 0x46546c67, true); // glTF
  ov.setUint32(4, 2, true);          // version
  ov.setUint32(8, totalSize, true);   // length

  // JSON chunk
  ov.setUint32(12, paddedLen, true);
  ov.setUint32(16, 0x4e4f534a, true); // "JSON"
  oa.set(newJsonBytes, 20);
  for (let i = newJsonBytes.length; i < paddedLen; i++) oa[20 + i] = 0x20;

  // BIN chunk
  const bo = 20 + paddedLen;
  ov.setUint32(bo, binLength, true);
  ov.setUint32(bo + 4, 0x004e4942, true); // "BIN\0"
  oa.set(binData, bo + 8);

  return out;
}

// ============================================================
// LOAD AVATAR MODEL
// ============================================================

async function loadAvatarModel(): Promise<THREE.Group> {
  // 1. Download asset via Expo
  const asset = Asset.fromModule(require('../../assets/models/avatar.glb'));
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error('Avatar GLB: asset download failed');

  // 2. Fetch raw bytes
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();

  // 3. Extract name mapping BEFORE stripping textures
  const nameMap = parseGLBNameMap(buffer);

  // Log mesh mapping for debugging
  console.log('[Avatar3D] GLB name map:', JSON.stringify(nameMap));

  // 4. Strip textures for RN compatibility
  const cleanBuffer = stripGLBTextures(buffer);

  // 5. Parse with GLTFLoader
  const loader = new GLTFLoader();
  const gltf: any = await new Promise((resolve, reject) => {
    loader.parse(cleanBuffer, '', resolve, reject);
  });

  const model = gltf.scene as THREE.Group;

  // 6. Rename meshes using GLB name map + apply skin-colored material
  const identifiedMeshes: string[] = [];
  model.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;

    // Rename from node name to mesh name
    const meshName = nameMap[mesh.name];
    if (meshName) mesh.name = meshName;

    identifiedMeshes.push(mesh.name);

    // Dispose original material and assign heatmap-ready material
    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else (mesh.material as THREE.Material).dispose();
    }

    // Anatomical meshes get highlighted skin color, base body gets darker tone
    const isAnatomical = GLB_MESH_TO_SITE[mesh.name] !== undefined;
    mesh.material = new THREE.MeshStandardMaterial({
      color: isAnatomical ? SKIN_COLOR : 0xb0956e,
      roughness: 0.7,
      metalness: 0.05,
    });
  });

  // Log identified meshes
  console.log('[Avatar3D] Identified meshes:', identifiedMeshes);

  // 7. Validate required meshes
  const found = new Set(identifiedMeshes);
  const missing = REQUIRED_MESHES.filter((n) => !found.has(n));
  if (missing.length > 0) {
    console.warn('[Avatar3D] Missing required meshes:', missing);
    // Don't throw - render what we have, but log the warning
  }

  // 8. Center at origin
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  // 9. Scale to fit (~1.4 scene units tall)
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) model.scale.setScalar(1.4 / maxDim);

  return model;
}

// ============================================================
// HEATMAP HELPERS
// ============================================================

function getHeatColor(value: number): THREE.Color {
  if (value <= 0.2) return HEAT_LOW.clone();
  if (value <= 0.5) {
    const t = (value - 0.2) / 0.3;
    return HEAT_LOW.clone().lerp(HEAT_MID, t);
  }
  if (value <= 0.8) {
    const t = (value - 0.5) / 0.3;
    return HEAT_MID.clone().lerp(HEAT_HIGH, t);
  }
  return HEAT_HIGH.clone();
}

function applyHeatmapToMeshes(
  meshMap: Record<string, THREE.Mesh>,
  values: Record<string, number>,
): void {
  for (const [name, mesh] of Object.entries(meshMap)) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat) continue;
    const v = values[name];
    if (v !== undefined) {
      mat.emissive.copy(getHeatColor(v));
      mat.emissiveIntensity = 0.55;
    } else {
      mat.emissive.set(0x000000);
      mat.emissiveIntensity = 0;
    }
  }
}

// ============================================================
// ERROR BOUNDARY
// ============================================================

interface EBProps { children: React.ReactNode }
interface EBState { error: Error | null }

class Avatar3DErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <View style={ebStyles.wrap} data-testid="avatar3d-error">
          <Text style={ebStyles.title}>Erro ao carregar avatar 3D</Text>
          <Text style={ebStyles.detail}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const ebStyles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 12, padding: 20 },
  title: { color: '#ef4444', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  detail: { color: '#9ca3af', fontSize: 12, textAlign: 'center' },
});

// ============================================================
// PROPS
// ============================================================

interface Avatar3DProps {
  onPartSelect?: (meshName: string) => void;
  highlightedPart?: string | null;
  heatmapValues?: Record<string, number>;
  autoRotate?: boolean;
  style?: any;
}

// ============================================================
// INNER COMPONENT (rendering + interaction logic)
// ============================================================

function Avatar3DInner({
  onPartSelect,
  highlightedPart,
  heatmapValues,
  autoRotate = true,
  style,
}: Avatar3DProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Three.js refs (outside React render cycle) ----
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<any>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const meshMapRef = useRef<Record<string, THREE.Mesh>>({});
  const animFrameRef = useRef<number | null>(null);
  const viewSizeRef = useRef({ width: 1, height: 1 });
  const mountedRef = useRef(true);

  // Touch
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Prop mirrors (avoid stale closures)
  const autoRotateRef = useRef(autoRotate);
  const heatmapRef = useRef<Record<string, number>>({});

  // Highlight restore state
  const prevHLRef = useRef<{
    name: string; emissive: THREE.Color; intensity: number;
  } | null>(null);

  // Raycaster (reused, zero-alloc per frame)
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());

  // ---- Sync props to refs ----
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

  useEffect(() => {
    if (!heatmapValues) return;
    heatmapRef.current = heatmapValues;
    if (Object.keys(meshMapRef.current).length > 0) {
      applyHeatmapToMeshes(meshMapRef.current, heatmapValues);
    }
  }, [heatmapValues]);

  useEffect(() => {
    applyHighlight(highlightedPart ?? null);
  }, [highlightedPart]);

  // ---- Cleanup ----
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      sceneRef.current?.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
          else (m.material as THREE.Material)?.dispose();
        }
      });
      rendererRef.current?.dispose?.();
    };
  }, []);

  // ---- Highlight ----
  function applyHighlight(meshName: string | null) {
    // Restore previous
    if (prevHLRef.current) {
      const prev = meshMapRef.current[prevHLRef.current.name];
      if (prev) {
        const mat = prev.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(prevHLRef.current.emissive);
        mat.emissiveIntensity = prevHLRef.current.intensity;
      }
      prevHLRef.current = null;
    }
    // Apply new
    if (meshName) {
      const mesh = meshMapRef.current[meshName];
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        prevHLRef.current = {
          name: meshName,
          emissive: mat.emissive.clone(),
          intensity: mat.emissiveIntensity,
        };
        mat.emissive.set(0x3388ff);
        mat.emissiveIntensity = 0.6;
      }
    }
  }

  // ---- GL Context Created ----
  const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
    try {
      console.log('[Avatar3D] GL context created, drawingBuffer:', gl.drawingBufferWidth, 'x', gl.drawingBufferHeight);

      // Renderer
      const renderer = new Renderer({ gl });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(0x1a1a2e, 1);
      rendererRef.current = renderer;

      // Scene
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // Camera
      const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
      camera.position.set(0, 0.4, 1.8);
      camera.lookAt(0, 0.3, 0);
      cameraRef.current = camera;

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(2, 3, 2);
      scene.add(dir);
      const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
      fill.position.set(-2, 1, -1);
      scene.add(fill);

      // Load GLB model (MANDATORY — no fallback)
      console.log('[Avatar3D] Loading GLB model...');
      const model = await loadAvatarModel();
      scene.add(model);
      modelRef.current = model;
      console.log('[Avatar3D] Model loaded and added to scene');

      // Index meshes by name (only anatomical meshes for interaction)
      const map: Record<string, THREE.Mesh> = {};
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          // Clone material so each mesh has its own instance
          mesh.material = (mesh.material as THREE.Material).clone();
          // Only index anatomical meshes (not the base body)
          if (GLB_MESH_TO_SITE[mesh.name]) {
            map[mesh.name] = mesh;
          }
        }
      });
      meshMapRef.current = map;

      console.log('[Avatar3D] Indexed anatomical meshes:', Object.keys(map));

      // Apply initial heatmap if values were provided before GL was ready
      if (heatmapRef.current && Object.keys(heatmapRef.current).length > 0) {
        applyHeatmapToMeshes(map, heatmapRef.current);
      }

      viewSizeRef.current = {
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
      };

      if (mountedRef.current) setLoading(false);

      // ---- Render loop ----
      const animate = () => {
        animFrameRef.current = requestAnimationFrame(animate);
        if (autoRotateRef.current && modelRef.current) {
          modelRef.current.rotation.y += AUTO_ROTATE_SPEED;
        }
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      animate();
    } catch (err: any) {
      console.error('[Avatar3D] onContextCreate error:', err);
      if (mountedRef.current) {
        setError(err?.message || 'Failed to load GLB model');
        setLoading(false);
      }
    }
  }, []);

  // ---- Touch handlers (raycasting) ----
  const onTouchStart = useCallback((e: any) => {
    const t = e.nativeEvent;
    touchStartRef.current = { x: t.locationX, y: t.locationY, time: Date.now() };
  }, []);

  const onTouchEnd = useCallback((e: any) => {
    const t = e.nativeEvent;
    const start = touchStartRef.current;
    if (!start) return;

    const dt = Date.now() - start.time;
    const dx = Math.abs(t.locationX - start.x);
    const dy = Math.abs(t.locationY - start.y);

    // Only treat as tap if short & small movement
    if (dt < 300 && dx < 15 && dy < 15 && cameraRef.current) {
      const scaleX = viewSizeRef.current.width /
        (t.target?.clientWidth || viewSizeRef.current.width);
      const scaleY = viewSizeRef.current.height /
        (t.target?.clientHeight || viewSizeRef.current.height);

      const px = t.locationX * (Platform.OS === 'web' ? 1 : scaleX);
      const py = t.locationY * (Platform.OS === 'web' ? 1 : scaleY);

      // Normalized device coordinates
      pointerRef.current.x = (px / viewSizeRef.current.width) * 2 - 1;
      pointerRef.current.y = -(py / viewSizeRef.current.height) * 2 + 1;

      raycasterRef.current.setFromCamera(pointerRef.current, cameraRef.current);
      const meshes = Object.values(meshMapRef.current);
      const hits = raycasterRef.current.intersectObjects(meshes, false);

      if (hits.length > 0) {
        const meshName = hits[0].object.name;
        console.log('[Avatar3D] Mesh tapped:', meshName, '→ site:', GLB_MESH_TO_SITE[meshName]);
        applyHighlight(meshName);
        onPartSelect?.(meshName);
      }
    }
    touchStartRef.current = null;
  }, [onPartSelect]);

  // ---- Error state ----
  if (error) {
    return (
      <View style={[styles.container, style]} data-testid="avatar3d-load-error">
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Erro ao carregar avatar 3D</Text>
          <Text style={styles.errorDetail}>{error}</Text>
        </View>
      </View>
    );
  }

  // ---- Render ----
  return (
    <View style={[styles.container, style]} data-testid="avatar3d-container">
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Carregando modelo 3D...</Text>
        </View>
      )}
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      />
    </View>
  );
}

// ============================================================
// EXPORTED COMPONENT (wrapped in Error Boundary)
// ============================================================

export function Avatar3D(props: Avatar3DProps) {
  return (
    <Avatar3DErrorBoundary>
      <Avatar3DInner {...props} />
    </Avatar3DErrorBoundary>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    overflow: 'hidden',
  },
  glView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    zIndex: 10,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 8,
  },
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorDetail: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
  },
});
