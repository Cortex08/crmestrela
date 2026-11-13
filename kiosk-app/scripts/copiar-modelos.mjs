import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
const de = 'node_modules/@vladmandic/face-api/model';
mkdirSync('public/models', { recursive: true });
for (const f of readdirSync(de)) {
  if (/^(tiny_face_detector_model|face_landmark_68_model|face_recognition_model)/.test(f)) copyFileSync(`${de}/${f}`, `public/models/${f}`);
}
console.log('modelos copiados');
