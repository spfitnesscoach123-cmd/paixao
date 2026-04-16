/**
 * Avatar3D.tsx — Real GLB-based 3D avatar with heatmap, raycasting,
 * drag rotation, auto-rotation with inertia, and adaptive camera.
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

import React, { useRef, useCallback, useEffect, useState, useMemo, Component } from 'react';
import {
  View, Text, StyleSheet, Platform, ActivityIndicator, PanResponder, PixelRatio,
  type GestureResponderEvent, type PanResponderGestureState,
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
const DRAG_SENSITIVITY = 0.008;
const INERTIA_DAMPING = 0.95;
const INERTIA_THRESHOLD = 0.0001;
const MAX_INERTIA_VELOCITY = 0.1;
const TAP_MAX_DURATION = 300; // ms
const TAP_MAX_DISTANCE = 25; // px (generous for touch screens — finger tremor causes 15-20px)

/**
 * GLB mesh name -> SkinfoldSite (protocol engine key).
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
const INDICATOR_COLOR = new THREE.Color(0x7c3aed); // purple — "tap here" for unfilled protocol sites

// ============================================================
// GLB BINARY UTILITIES
// ============================================================

/**
 * Parse the JSON chunk of a GLB to build a node-name -> mesh-name map.
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
 */
function stripGLBTextures(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  const jsonBytes = new Uint8Array(buffer, 20, jsonLength);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes));

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

  const newJsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const paddedLen = (newJsonBytes.length + 3) & ~3;

  const binStart = 12 + 8 + jsonLength;
  const binLength = view.getUint32(binStart, true);
  const binData = new Uint8Array(buffer, binStart + 8, binLength);

  const totalSize = 12 + 8 + paddedLen + 8 + binLength;
  const out = new ArrayBuffer(totalSize);
  const ov = new DataView(out);
  const oa = new Uint8Array(out);

  ov.setUint32(0, 0x46546c67, true);
  ov.setUint32(4, 2, true);
  ov.setUint32(8, totalSize, true);

  ov.setUint32(12, paddedLen, true);
  ov.setUint32(16, 0x4e4f534a, true);
  oa.set(newJsonBytes, 20);
  for (let i = newJsonBytes.length; i < paddedLen; i++) oa[20 + i] = 0x20;

  const bo = 20 + paddedLen;
  ov.setUint32(bo, binLength, true);
  ov.setUint32(bo + 4, 0x004e4942, true);
  oa.set(binData, bo + 8);

  return out;
}

// ============================================================
// LOAD AVATAR MODEL
// ============================================================

async function loadAvatarModel(): Promise<THREE.Group> {
  const asset = Asset.fromModule(require('../../assets/models/avatar.glb'));
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error('Avatar GLB: asset download failed');

  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();

  const nameMap = parseGLBNameMap(buffer);
  console.log('[Avatar3D] GLB name map:', JSON.stringify(nameMap));

  const cleanBuffer = stripGLBTextures(buffer);

  const loader = new GLTFLoader();
  const gltf: any = await new Promise((resolve, reject) => {
    loader.parse(cleanBuffer, '', resolve, reject);
  });

  const model = gltf.scene as THREE.Group;

  const identifiedMeshes: string[] = [];
  model.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;

    const meshName = nameMap[mesh.name];
    if (meshName) mesh.name = meshName;

    identifiedMeshes.push(mesh.name);

    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else (mesh.material as THREE.Material).dispose();
    }

    const isAnatomical = GLB_MESH_TO_SITE[mesh.name] !== undefined;
    mesh.material = new THREE.MeshStandardMaterial({
      color: isAnatomical ? SKIN_COLOR : 0xb0956e,
      roughness: 0.7,
      metalness: 0.05,
    });
  });

  console.log('[Avatar3D] Identified meshes:', identifiedMeshes);

  const found = new Set(identifiedMeshes);
  const missing = REQUIRED_MESHES.filter((n) => !found.has(n));
  if (missing.length > 0) {
    console.warn('[Avatar3D] Missing required meshes:', missing);
  }

  // Center at origin
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  // Scale to fit (~1.4 scene units tall)
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

/**
 * Apply heatmap colors DIRECTLY to mat.color (not emissive — emissive is too subtle).
 * Values:  > 0  → heatmap gradient (green/yellow/red based on magnitude)
 *          < 0  → protocol indicator (purple "tap here")
 *          undefined → skin color (not part of protocol/data)
 */
function applyHeatmapToMeshes(
  meshMap: Record<string, THREE.Mesh>,
  values: Record<string, number>,
): void {
  for (const [name, mesh] of Object.entries(meshMap)) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat) continue;
    const v = values[name];
    if (v !== undefined && v < 0) {
      mat.color.copy(INDICATOR_COLOR);
    } else if (v !== undefined && v > 0) {
      mat.color.copy(getHeatColor(v));
    } else {
      mat.color.set(SKIN_COLOR);
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

  // ---- Three.js refs ----
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<any>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const meshMapRef = useRef<Record<string, THREE.Mesh>>({});
  const animFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // ---- Layout & Interaction refs ----
  const layoutSizeRef = useRef({ width: 1, height: 1 });
  const isInteractingRef = useRef(false);
  const lastPanXRef = useRef(0);
  const rotationVelocityRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // ---- Prop mirrors (avoid stale closures) ----
  const autoRotateRef = useRef(autoRotate);
  const heatmapRef = useRef<Record<string, number>>({});
  const onPartSelectRef = useRef(onPartSelect);

  // ---- Highlight state ----
  const prevHLRef = useRef<{
    name: string; emissive: THREE.Color; intensity: number;
  } | null>(null);

  // ---- Raycaster ----
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());

  // ---- Sync props to refs ----
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);
  useEffect(() => { onPartSelectRef.current = onPartSelect; }, [onPartSelect]);

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
    if (prevHLRef.current) {
      const prev = meshMapRef.current[prevHLRef.current.name];
      if (prev) {
        const mat = prev.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(prevHLRef.current.emissive);
        mat.emissiveIntensity = prevHLRef.current.intensity;
      }
      prevHLRef.current = null;
    }
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

  // ---- Layout handler (captures view dimensions in LAYOUT POINTS for raycasting) ----
  const onLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      layoutSizeRef.current = { width, height };
      console.log('[Avatar3D] onLayout: width=', width, 'height=', height, 'pixelRatio=', PixelRatio.get());
    }
  }, []);

  // ---- Handle tap (raycasting with LAYOUT-BASED coordinates) ----
  const handleTap = useCallback((touchX: number, touchY: number) => {
    const camera = cameraRef.current;
    const meshMap = meshMapRef.current;

    if (!camera || Object.keys(meshMap).length === 0) {
      console.log('[Avatar3D] handleTap SKIP: camera=', !!camera, 'meshes=', Object.keys(meshMap).length);
      return;
    }

    const { width, height } = layoutSizeRef.current;
    if (width <= 1 || height <= 1) {
      console.log('[Avatar3D] handleTap SKIP: layout not ready, w=', width, 'h=', height);
      return;
    }

    // === CORE FIX: Convert touch coords (layout POINTS) to NDC (-1 to +1) ===
    // locationX/Y are in layout points (same coordinate system as onLayout)
    // NO PixelRatio multiplication needed — both systems use points
    const ndcX = (touchX / width) * 2 - 1;
    const ndcY = -(touchY / height) * 2 + 1;

    pointerRef.current.set(ndcX, ndcY);

    // DEBUG LOGS — console.warn so they appear in Mac Console (NSLog bridge)
    console.warn('[Avatar3D] TOUCH:' + touchX.toFixed(1) + ',' + touchY.toFixed(1) + ' LAYOUT:' + width.toFixed(1) + ',' + height.toFixed(1) + ' NDC:' + ndcX.toFixed(3) + ',' + ndcY.toFixed(3));

    // Cast ray from camera through NDC point
    raycasterRef.current.setFromCamera(pointerRef.current, camera);

    // Intersect with ALL anatomical meshes (recursive = true for safety)
    const meshes = Object.values(meshMap);
    const hits = raycasterRef.current.intersectObjects(meshes, true);

    console.log('[Avatar3D] INTERSECTS:', hits.length, 'out of', meshes.length, 'meshes');

    if (hits.length > 0) {
      // Walk up to find the named anatomical mesh
      let hitObj = hits[0].object;
      let meshName = hitObj.name;

      // If the hit object isn't a known mesh, check parent chain
      while (hitObj && !GLB_MESH_TO_SITE[meshName]) {
        hitObj = hitObj.parent as THREE.Object3D;
        if (hitObj) meshName = hitObj.name;
        else break;
      }

      if (GLB_MESH_TO_SITE[meshName]) {
        console.log('[Avatar3D] HIT:', meshName, '-> site:', GLB_MESH_TO_SITE[meshName]);
        applyHighlight(meshName);
        onPartSelectRef.current?.(meshName);
      } else {
        console.log('[Avatar3D] HIT object not anatomical:', hits[0].object.name, 'distance:', hits[0].distance.toFixed(3));
      }
    } else {
      console.log('[Avatar3D] MISS: no intersections at NDC(', ndcX.toFixed(3), ',', ndcY.toFixed(3), ')');
    }
  }, []);

  // ---- PanResponder (drag rotation + tap detection) ----
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    onPanResponderGrant: (e: GestureResponderEvent) => {
      isInteractingRef.current = true;
      rotationVelocityRef.current = 0;
      lastPanXRef.current = 0;
      touchStartRef.current = {
        x: e.nativeEvent.locationX,
        y: e.nativeEvent.locationY,
        time: Date.now(),
      };
      console.warn('[Avatar3D] PanGrant: locationX=' + e.nativeEvent.locationX.toFixed(1) + ' locationY=' + e.nativeEvent.locationY.toFixed(1));
    },

    onPanResponderMove: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
      if (modelRef.current) {
        const deltaDx = gs.dx - lastPanXRef.current;
        lastPanXRef.current = gs.dx;
        modelRef.current.rotation.y += deltaDx * DRAG_SENSITIVITY;
      }
    },

    onPanResponderRelease: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
      isInteractingRef.current = false;

      // Inertia from release velocity (capped)
      const vel = gs.vx * 0.003;
      rotationVelocityRef.current = Math.min(Math.max(vel, -MAX_INERTIA_VELOCITY), MAX_INERTIA_VELOCITY);

      // Detect tap (short time, small movement)
      const start = touchStartRef.current;
      if (start) {
        const dt = Date.now() - start.time;
        if (dt < TAP_MAX_DURATION && Math.abs(gs.dx) < TAP_MAX_DISTANCE && Math.abs(gs.dy) < TAP_MAX_DISTANCE) {
          handleTap(start.x, start.y);
        }
      }
      touchStartRef.current = null;
    },

    onPanResponderTerminate: () => {
      isInteractingRef.current = false;
      touchStartRef.current = null;
    },
  }), [handleTap]);

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

      // Camera (will be repositioned after model load)
      const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
      cameraRef.current = camera;

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(2, 3, 2);
      scene.add(dir);
      const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
      fill.position.set(-2, 1, -1);
      scene.add(fill);

      // Load GLB model
      console.log('[Avatar3D] Loading GLB model...');
      const model = await loadAvatarModel();
      scene.add(model);
      modelRef.current = model;
      console.log('[Avatar3D] Model loaded and added to scene');

      // ---- AUTO-FIT CAMERA to model bounding box ----
      const finalBox = new THREE.Box3().setFromObject(model);
      const finalSize = finalBox.getSize(new THREE.Vector3());
      const finalCenter = finalBox.getCenter(new THREE.Vector3());

      const halfFov = (camera.fov / 2) * (Math.PI / 180);

      // Distance to fit model height
      let fitDistance = (finalSize.y / 2) / Math.tan(halfFov);

      // Also check if model width needs more distance (narrow viewports)
      const hHalfFov = Math.atan(Math.tan(halfFov) * aspect);
      const widthFitDist = (finalSize.x / 2) / Math.tan(hHalfFov);
      fitDistance = Math.max(fitDistance, widthFitDist);

      // Add 25% padding so the model doesn't touch the edges
      fitDistance *= 1.25;

      camera.position.set(0, finalCenter.y, fitDistance);
      camera.lookAt(finalCenter.x, finalCenter.y, finalCenter.z);
      console.log('[Avatar3D] Camera auto-fit: distance=', fitDistance.toFixed(2), 'centerY=', finalCenter.y.toFixed(2));
      console.log('[Avatar3D] Camera state: pos=', camera.position.toArray().map(v => v.toFixed(2)), 'aspect=', aspect.toFixed(3), 'fov=', camera.fov);
      console.log('[Avatar3D] Model bounds: size=', finalSize.toArray().map(v => v.toFixed(2)), 'center=', finalCenter.toArray().map(v => v.toFixed(2)));

      // Index anatomical meshes
      const map: Record<string, THREE.Mesh> = {};
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.material = (mesh.material as THREE.Material).clone();
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

      if (mountedRef.current) setLoading(false);

      // ---- Render loop with inertia ----
      const animate = () => {
        animFrameRef.current = requestAnimationFrame(animate);

        if (!isInteractingRef.current && modelRef.current) {
          // Apply drag inertia
          if (Math.abs(rotationVelocityRef.current) > INERTIA_THRESHOLD) {
            modelRef.current.rotation.y += rotationVelocityRef.current;
            rotationVelocityRef.current *= INERTIA_DAMPING;
          } else if (autoRotateRef.current) {
            // Auto-rotate when idle (no drag inertia)
            modelRef.current.rotation.y += AUTO_ROTATE_SPEED;
          }
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
    <View
      style={[styles.container, style]}
      onLayout={onLayout}
      {...panResponder.panHandlers}
      data-testid="avatar3d-container"
    >
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Carregando modelo 3D...</Text>
        </View>
      )}
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
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
