/**
 * Avatar3D.tsx
 *
 * Renders an interactive 3D humanoid avatar using Three.js + expo-gl.
 * Supports: auto-rotation, touch → raycasting, mesh highlight, heatmap.
 *
 * Usage:
 *   <Avatar3D onPartSelect={(part) => console.log(part)} />
 *
 * The component uses a procedural humanoid model by default.
 * When a .glb asset is available, swap createProceduralAvatar() for GLTF loading.
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { useAvatarControls } from '../../hooks/useAvatarControls';

interface Avatar3DProps {
  onPartSelect?: (meshName: string) => void;
  highlightedPart?: string | null;
  heatmapValues?: Record<string, number>;
  autoRotate?: boolean;
  style?: any;
}

// ============================================================
// PROCEDURAL AVATAR (used until .glb is provided)
// ============================================================

function createProceduralAvatar(): THREE.Group {
  const group = new THREE.Group();

  const skinColor = 0xc8a07e;
  const makeMat = () => new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.7,
    metalness: 0.05,
  });

  // Head — sphere
  const headGeo = new THREE.SphereGeometry(0.12, 16, 16);
  const head = new THREE.Mesh(headGeo, makeMat());
  head.name = 'Head';
  head.position.set(0, 0.85, 0);
  group.add(head);

  // Neck
  const neckGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.06, 8);
  const neck = new THREE.Mesh(neckGeo, makeMat());
  neck.name = 'Neck';
  neck.position.set(0, 0.72, 0);
  group.add(neck);

  // Torso — tapered cylinder
  const torsoGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.4, 12);
  const torso = new THREE.Mesh(torsoGeo, makeMat());
  torso.name = 'Torso';
  torso.position.set(0, 0.48, 0);
  group.add(torso);

  // Hips
  const hipsGeo = new THREE.CylinderGeometry(0.12, 0.11, 0.08, 10);
  const hips = new THREE.Mesh(hipsGeo, makeMat());
  hips.name = 'Hips';
  hips.position.set(0, 0.25, 0);
  group.add(hips);

  // Left Upper Arm
  const luaGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.22, 8);
  const lua = new THREE.Mesh(luaGeo, makeMat());
  lua.name = 'LeftArm';
  lua.position.set(-0.2, 0.56, 0);
  lua.rotation.z = 0.15;
  group.add(lua);

  // Left Forearm
  const lfaGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.2, 8);
  const lfa = new THREE.Mesh(lfaGeo, makeMat());
  lfa.name = 'LeftForearm';
  lfa.position.set(-0.24, 0.36, 0);
  lfa.rotation.z = 0.1;
  group.add(lfa);

  // Right Upper Arm
  const ruaGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.22, 8);
  const rua = new THREE.Mesh(ruaGeo, makeMat());
  rua.name = 'RightArm';
  rua.position.set(0.2, 0.56, 0);
  rua.rotation.z = -0.15;
  group.add(rua);

  // Right Forearm
  const rfaGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.2, 8);
  const rfa = new THREE.Mesh(rfaGeo, makeMat());
  rfa.name = 'RightForearm';
  rfa.position.set(0.24, 0.36, 0);
  rfa.rotation.z = -0.1;
  group.add(rfa);

  // Left Upper Leg
  const lulGeo = new THREE.CylinderGeometry(0.055, 0.04, 0.3, 10);
  const lul = new THREE.Mesh(lulGeo, makeMat());
  lul.name = 'LeftLeg';
  lul.position.set(-0.07, 0.06, 0);
  group.add(lul);

  // Left Lower Leg
  const lllGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.3, 8);
  const lll = new THREE.Mesh(lllGeo, makeMat());
  lll.name = 'LeftLowerLeg';
  lll.position.set(-0.07, -0.22, 0);
  group.add(lll);

  // Right Upper Leg
  const rulGeo = new THREE.CylinderGeometry(0.055, 0.04, 0.3, 10);
  const rul = new THREE.Mesh(rulGeo, makeMat());
  rul.name = 'RightLeg';
  rul.position.set(0.07, 0.06, 0);
  group.add(rul);

  // Right Lower Leg
  const rllGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.3, 8);
  const rll = new THREE.Mesh(rllGeo, makeMat());
  rll.name = 'RightLowerLeg';
  rll.position.set(0.07, -0.22, 0);
  group.add(rll);

  // Center the model
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);

  return group;
}

// ============================================================
// COMPONENT
// ============================================================

export function Avatar3D({
  onPartSelect,
  highlightedPart,
  heatmapValues,
  autoRotate = true,
  style,
}: Avatar3DProps) {
  const controls = useAvatarControls({ autoRotateSpeed: 0.005 });
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<any>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const viewSizeRef = useRef({ width: 1, height: 1 });

  // Apply external highlight
  useEffect(() => {
    controls.highlight(highlightedPart ?? null);
  }, [highlightedPart, controls]);

  // Apply auto-rotate toggle
  useEffect(() => {
    controls.setAutoRotate(autoRotate);
  }, [autoRotate, controls]);

  // Apply heatmap values
  useEffect(() => {
    if (heatmapValues && Object.keys(controls.meshMapRef.current).length > 0) {
      const { applyHeatmap } = require('../../utils/heatmap');
      applyHeatmap(controls.meshMapRef.current, heatmapValues);
    }
  }, [heatmapValues, controls]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      // Dispose geometries and materials
      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.geometry?.dispose();
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((m) => m.dispose());
            } else {
              mesh.material?.dispose();
            }
          }
        });
      }
    };
  }, []);

  const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
    glRef.current = gl;

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
    controls.cameraRef.current = camera;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(2, 3, 2);
    scene.add(directional);

    const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
    fill.position.set(-2, 1, -1);
    scene.add(fill);

    // Avatar model (procedural for now — replace with GLTF later)
    const avatar = createProceduralAvatar();
    scene.add(avatar);
    controls.registerModel(avatar);

    // Track view size for raycasting
    viewSizeRef.current = {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    };

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.onFrame();
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();
  }, [controls]);

  // Touch handlers for raycasting
  const onTouchStart = useCallback((e: any) => {
    const touch = e.nativeEvent;
    touchStartRef.current = {
      x: touch.locationX,
      y: touch.locationY,
      time: Date.now(),
    };
  }, []);

  const onTouchEnd = useCallback((e: any) => {
    const touch = e.nativeEvent;
    const start = touchStartRef.current;
    if (!start) return;

    // Only count as tap if short duration and small movement
    const dt = Date.now() - start.time;
    const dx = Math.abs(touch.locationX - start.x);
    const dy = Math.abs(touch.locationY - start.y);

    if (dt < 300 && dx < 15 && dy < 15) {
      // Scale touch coords to GL buffer size
      const scaleX = viewSizeRef.current.width / (e.nativeEvent.target?.clientWidth || viewSizeRef.current.width);
      const scaleY = viewSizeRef.current.height / (e.nativeEvent.target?.clientHeight || viewSizeRef.current.height);

      const result = controls.raycast(
        touch.locationX * (Platform.OS === 'web' ? 1 : scaleX),
        touch.locationY * (Platform.OS === 'web' ? 1 : scaleY),
        viewSizeRef.current.width,
        viewSizeRef.current.height
      );

      if (result) {
        controls.highlight(result.meshName);
        onPartSelect?.(result.meshName);
      }
    }

    touchStartRef.current = null;
  }, [controls, onPartSelect]);

  return (
    <View style={[styles.container, style]}>
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      />
    </View>
  );
}

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
});
