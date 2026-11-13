// Depois do vite build: copia os modelos de reconhecimento facial e publica o app do quiosque em /kiosk
import { mkdirSync, readdirSync, copyFileSync, existsSync, cpSync } from 'node:fs';
import { execSync } from 'node:child_process';

const de = 'node_modules/@vladmandic/face-api/model';
mkdirSync('dist/models', { recursive: true });
for (const f of readdirSync(de)) {
  if (/^(tiny_face_detector_model|face_landmark_68_model|face_recognition_model)/.test(f)) copyFileSync(`${de}/${f}`, `dist/models/${f}`);
}
console.log('modelos copiados para dist/models');

if (existsSync('kiosk-app/package.json')) {
  execSync('npm install --no-audit --no-fund && npm run build', { cwd: 'kiosk-app', stdio: 'inherit' });
  cpSync('kiosk-app/dist', 'dist/kiosk', { recursive: true });
  console.log('app do quiosque publicado em dist/kiosk');
}
