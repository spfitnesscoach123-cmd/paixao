/**
 * Expo Config Plugin — MediaPipe Pose Detection via Vision Camera
 *
 * Responsabilidades:
 * 1. Injecao robusta do pod MediaPipeTasksVision no Podfile (withDangerousMod)
 * 2. Copia de arquivos nativos Swift/Obj-C + modelo .task ao projeto Xcode
 * 3. Adicao dos arquivos ao Xcode project
 *
 * Estrategia de Podfile (deterministica, sem depender de extraPods):
 * - source 'https://cdn.cocoapods.org/' no topo
 * - pod 'MediaPipeTasksVision', '0.10.14' dentro do target
 * - BUILD_LIBRARY_FOR_DISTRIBUTION no post_install
 * - use_frameworks! delegado ao template do Expo via Podfile.properties.json
 * - Tudo idempotente e com logging extensivo para debug no EAS
 *
 * NOTA SOBRE use_frameworks!:
 * O template do Expo SDK 54 ja aplica use_frameworks! :linkage => :static
 * DENTRO do target, lendo de Podfile.properties.json (configurado por
 * expo-build-properties em app.json). NAO injetamos use_frameworks!
 * diretamente — isso evita duplicacao e conflitos.
 *
 * FALLBACK: Se precisar forcar use_frameworks! :linkage => :dynamic,
 * altere expo-build-properties no app.json:
 *   "ios": { "useFrameworks": "dynamic" }
 */

const {
  withDangerousMod,
  withXcodeProject,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// ─── Configuracao Central ───────────────────────────────────────────
const MEDIAPIPE_POD_LINE = "pod 'MediaPipeTasksVision', '0.10.14'";
const COCOAPODS_SOURCE = "source 'https://cdn.cocoapods.org/'";
// ────────────────────────────────────────────────────────────────────

function withMediaPipePose(config) {

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Modificacao direta e robusta do Podfile via withDangerousMod
  // ═══════════════════════════════════════════════════════════════════
  config = withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const podfilePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'Podfile'
      );

      if (!fs.existsSync(podfilePath)) {
        console.error('[withMediaPipePose] ERRO FATAL: Podfile nao encontrado em', podfilePath);
        return modConfig;
      }

      let contents = fs.readFileSync(podfilePath, 'utf-8');
      console.log('[withMediaPipePose] ======================================================');
      console.log('[withMediaPipePose] Podfile encontrado. Tamanho:', contents.length, 'bytes');

      // ── 1a. Adicionar source do CocoaPods no topo (idempotente) ──
      if (!contents.includes(COCOAPODS_SOURCE)) {
        contents = COCOAPODS_SOURCE + '\n\n' + contents;
        console.log('[withMediaPipePose] [OK] source CDN adicionada ao topo do Podfile');
      } else {
        console.log('[withMediaPipePose] [SKIP] source CDN ja presente');
      }

      // ── 1b. Verificar que use_frameworks! sera aplicado pelo template ──
      if (contents.includes('use_frameworks!')) {
        console.log('[withMediaPipePose] [OK] use_frameworks! presente no Podfile (via template/properties)');
      } else {
        console.log('[withMediaPipePose] [WARN] use_frameworks! NAO encontrado no Podfile');
        console.log('[withMediaPipePose]        Verifique que expo-build-properties tem ios.useFrameworks: "static"');
        console.log('[withMediaPipePose]        e que Podfile.properties.json contem "ios.useFrameworks": "static"');
      }

      // ── 1c. Injetar pod MediaPipeTasksVision dentro do target (idempotente) ──
      if (!contents.includes("pod 'MediaPipeTasksVision'")) {
        let injected = false;

        // Estrategia 1: Apos a LINHA COMPLETA de config = use_native_modules!(...)
        // IMPORTANTE: captura a linha inteira incluindo parametros como (config_command)
        const nativeModulesRegex = /(config\s*=\s*use_native_modules![^\n]*)/;
        if (!injected && nativeModulesRegex.test(contents)) {
          contents = contents.replace(nativeModulesRegex, '$1\n\n  ' + MEDIAPIPE_POD_LINE);
          injected = true;
          console.log('[withMediaPipePose] [OK] Pod injetado apos config = use_native_modules!(...)');
        }

        // Estrategia 2: Apos use_expo_modules!
        if (!injected && contents.includes('use_expo_modules!')) {
          contents = contents.replace(
            /use_expo_modules![^\n]*/,
            '$&\n  ' + MEDIAPIPE_POD_LINE
          );
          injected = true;
          console.log('[withMediaPipePose] [OK] Pod injetado apos use_expo_modules!');
        }

        // Estrategia 3: Logo apos abertura do target
        if (!injected) {
          const targetBlockRegex = /(target\s+['"][^'"]+['"]\s+do)/;
          if (targetBlockRegex.test(contents)) {
            contents = contents.replace(targetBlockRegex, '$1\n  ' + MEDIAPIPE_POD_LINE);
            injected = true;
            console.log('[withMediaPipePose] [OK] Pod injetado apos abertura do bloco target');
          }
        }

        if (!injected) {
          console.error('[withMediaPipePose] [ERRO] Nao foi possivel encontrar ponto de injecao para o pod');
        }
      } else {
        console.log('[withMediaPipePose] [SKIP] Pod MediaPipeTasksVision ja presente no Podfile');
      }

      // ── 1d. Garantir BUILD_LIBRARY_FOR_DISTRIBUTION no post_install (idempotente) ──
      if (!contents.includes('BUILD_LIBRARY_FOR_DISTRIBUTION')) {
        const postInstallRegex = /(post_install\s+do\s+\|installer\|)/;
        if (postInstallRegex.test(contents)) {
          const buildDistBlock = [
            '',
            '    # -- MediaPipe: garantir distribuicao de modulos --',
            '    installer.pods_project.targets.each do |t|',
            '      t.build_configurations.each do |bc|',
            "        bc.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'",
            '      end',
            '    end',
          ].join('\n');
          contents = contents.replace(postInstallRegex, '$1' + buildDistBlock);
          console.log('[withMediaPipePose] [OK] BUILD_LIBRARY_FOR_DISTRIBUTION adicionado ao post_install');
        } else {
          // Se nao existe post_install, criar um antes do ultimo 'end'
          const lastEndIdx = contents.lastIndexOf('\nend');
          if (lastEndIdx !== -1) {
            const postInstallBlock = [
              '',
              '  post_install do |installer|',
              '    # -- MediaPipe: garantir distribuicao de modulos --',
              '    installer.pods_project.targets.each do |t|',
              '      t.build_configurations.each do |bc|',
              "        bc.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'",
              '      end',
              '    end',
              '  end',
            ].join('\n');
            contents = contents.slice(0, lastEndIdx) + postInstallBlock + contents.slice(lastEndIdx);
            console.log('[withMediaPipePose] [OK] post_install criado com BUILD_LIBRARY_FOR_DISTRIBUTION');
          } else {
            console.warn('[withMediaPipePose] [WARN] Nao foi possivel adicionar BUILD_LIBRARY_FOR_DISTRIBUTION');
          }
        }
      } else {
        console.log('[withMediaPipePose] [SKIP] BUILD_LIBRARY_FOR_DISTRIBUTION ja presente');
      }

      // ── Escrever Podfile modificado ──
      fs.writeFileSync(podfilePath, contents);

      // ── Logging de verificacao final ──
      console.log('[withMediaPipePose] ======================================================');
      console.log('[withMediaPipePose] VERIFICACAO FINAL DO PODFILE:');
      console.log('[withMediaPipePose]   source CDN:                  ', contents.includes(COCOAPODS_SOURCE) ? 'SIM' : 'NAO');
      console.log('[withMediaPipePose]   use_frameworks!:             ', contents.includes('use_frameworks!') ? 'SIM' : 'NAO');
      console.log('[withMediaPipePose]   MediaPipeTasksVision pod:    ', contents.includes("pod 'MediaPipeTasksVision'") ? 'SIM' : 'NAO');
      console.log('[withMediaPipePose]   BUILD_LIBRARY_FOR_DISTRIBUTION:', contents.includes('BUILD_LIBRARY_FOR_DISTRIBUTION') ? 'SIM' : 'NAO');
      console.log('[withMediaPipePose] ======================================================');

      // Dump completo do Podfile para debug no EAS
      const lines = contents.split('\n');
      console.log('[withMediaPipePose] PODFILE DUMP COMPLETO (' + lines.length + ' linhas):');
      lines.forEach((line, i) => {
        console.log('[Podfile:' + (i + 1) + '] ' + line);
      });
      console.log('[withMediaPipePose] ======================================================');

      return modConfig;
    },
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Copiar arquivos nativos + modelo, adicionar ao Xcode project
  // ═══════════════════════════════════════════════════════════════════
  config = withXcodeProject(config, (modConfig) => {
    const xcodeProject = modConfig.modResults;
    const projectRoot = modConfig.modRequest.projectRoot;
    const platformProjectRoot = modConfig.modRequest.platformProjectRoot;
    const projectName = modConfig.modRequest.projectName;

    const targetDir = path.join(platformProjectRoot, projectName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // ── Copiar Swift plugin ──
    const swiftSrc = path.join(projectRoot, 'plugins', 'ios', 'PoseDetectionPlugin.swift');
    const swiftDest = path.join(targetDir, 'PoseDetectionPlugin.swift');
    if (fs.existsSync(swiftSrc)) {
      fs.copyFileSync(swiftSrc, swiftDest);
      console.log('[withMediaPipePose] Copied PoseDetectionPlugin.swift');
    } else {
      console.error('[withMediaPipePose] PoseDetectionPlugin.swift not found at', swiftSrc);
    }

    // ── Gerar registrador Obj-C com nome do modulo correto ──
    const moduleName = projectName.replace(/[^a-zA-Z0-9_]/g, '');
    const objcContent = `//
// PoseDetectionPluginRegistrar.m
// Auto-generated by withMediaPipePose config plugin
//
#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#import "${moduleName}-Swift.h"

VISION_EXPORT_SWIFT_FRAME_PROCESSOR(PoseDetectionPlugin, detectPose)
`;
    const objcDest = path.join(targetDir, 'PoseDetectionPluginRegistrar.m');
    fs.writeFileSync(objcDest, objcContent);
    console.log('[withMediaPipePose] Generated PoseDetectionPluginRegistrar.m (module:', moduleName + ')');

    // ── Copiar modelo de pose se disponivel ──
    const modelSrc = path.join(projectRoot, 'assets', 'models', 'pose_landmarker_full.task');
    const modelDest = path.join(targetDir, 'pose_landmarker_full.task');
    if (fs.existsSync(modelSrc)) {
      fs.copyFileSync(modelSrc, modelDest);
      console.log('[withMediaPipePose] Copied pose_landmarker_full.task');
    } else {
      console.warn('[withMediaPipePose] Model not found — run: node scripts/download-pose-model.js');
    }

    // ── Adicionar arquivos ao Xcode project ──
    try {
      const groups = xcodeProject.hash.project.objects['PBXGroup'] || {};
      let appGroupKey = null;
      for (const [key, val] of Object.entries(groups)) {
        if (typeof val === 'object' && val.name === projectName) {
          appGroupKey = key;
          break;
        }
      }
      if (!appGroupKey) {
        appGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
      }

      const targetUuid = xcodeProject.getFirstTarget().uuid;

      // Adicionar Swift source
      if (fs.existsSync(swiftDest)) {
        xcodeProject.addSourceFile(
          `${projectName}/PoseDetectionPlugin.swift`,
          { target: targetUuid },
          appGroupKey
        );
      }

      // Adicionar Obj-C source
      xcodeProject.addSourceFile(
        `${projectName}/PoseDetectionPluginRegistrar.m`,
        { target: targetUuid },
        appGroupKey
      );

      // Adicionar modelo como recurso
      if (fs.existsSync(modelDest)) {
        if (!xcodeProject.pbxGroupByName('Resources')) {
          xcodeProject.addPbxGroup([], 'Resources');
        }
        xcodeProject.addResourceFile(
          `${projectName}/pose_landmarker_full.task`,
          { target: targetUuid },
          appGroupKey
        );
      }

      console.log('[withMediaPipePose] Added files to Xcode project');
    } catch (e) {
      console.warn('[withMediaPipePose] Xcode project warning:', e.message);
    }

    return modConfig;
  });

  return config;
}

module.exports = withMediaPipePose;
