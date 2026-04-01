#!/usr/bin/env node
/**
 * Download MediaPipe Pose Landmarker model for iOS integration.
 *
 * Usage: node scripts/download-pose-model.js
 *
 * Downloads pose_landmarker_full.task (~31MB) from Google's model repository
 * and saves it to assets/models/ for the Expo config plugin to bundle.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'models');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'pose_landmarker_full.task');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      const stats = fs.statSync(dest);
      if (stats.size > 1000000) {
        console.log(`Model already exists (${(stats.size / 1024 / 1024).toFixed(1)}MB): ${dest}`);
        return resolve();
      }
    }

    console.log('Downloading pose_landmarker_full.task...');
    console.log(`From: ${url}`);
    console.log(`To:   ${dest}`);

    fs.mkdirSync(path.dirname(dest), { recursive: true });

    const file = fs.createWriteStream(dest);

    const request = (currentUrl) => {
      https.get(currentUrl, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const total = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            process.stdout.write(`\r  ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(`\nDone! (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
          resolve();
        });
      }).on('error', (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    };

    request(url);
  });
}

download(MODEL_URL, OUTPUT_PATH).catch((err) => {
  console.error('Download failed:', err.message);
  process.exit(1);
});
