// Gera os ícones PNG do app (sem depender de bibliotecas de imagem).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const seg = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy); t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
function icone(n, pad) {
  const raw = Buffer.alloc((n * 3 + 1) * n);
  const r = n * (0.5 - pad), c = n / 2, w = n * 0.025;
  const P = (x, y) => [c + (x - 50) / 48 * r, c + (y - 50) / 48 * r];
  const tri = [[P(50, 16), P(79.4, 67), P(20.6, 67)], [P(50, 84), P(20.6, 33), P(79.4, 33)]];
  for (let y = 0; y < n; y++) {
    raw[y * (n * 3 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      let cov = 0, estrela = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const px = x + (sx + 0.5) / 3, py = y + (sy + 0.5) / 3;
        if (Math.hypot(px - c, py - c) <= r) {
          cov++;
          let d = 1e9; for (const t of tri) for (let i = 0; i < 3; i++) d = Math.min(d, seg(px, py, ...t[i], ...t[(i + 1) % 3]));
          if (d <= w / 2) estrela++;
        }
      }
      const f = (cov - estrela) / 9; // fração branca
      const o = y * (n * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(37 + (255 - 37) * f); raw[o + 1] = Math.round(99 + (255 - 99) * f); raw[o + 2] = Math.round(235 + (255 - 235) * f);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', icone(192, 0.12));
writeFileSync('public/icon-512.png', icone(512, 0.12));
writeFileSync('public/icon-maskable-512.png', icone(512, 0.2));
console.log('icones gerados');
