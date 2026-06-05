import zlib from 'zlib';
import fs from 'fs';

function uint32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const crcBuf = uint32be(crc32(Buffer.concat([t, data])));
  return Buffer.concat([uint32be(data.length), t, data, crcBuf]);
}

function createPNG(size, colors) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA

  const row = size * 4 + 1;
  const raw = Buffer.alloc(row * size);

  for (let y = 0; y < size; y++) {
    raw[y * row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // Gradient: top-left accent purple → bottom-right deep purple
      const t = (x + y) / (size * 2 - 2);
      const [r1, g1, b1] = colors[0];
      const [r2, g2, b2] = colors[1];
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);

      // Rounded corners: make pixels outside corner radius transparent
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      const radius = Math.round(size * 0.25);
      const inCorner = cx < radius && cy < radius;
      const dist = Math.sqrt((cx - radius) ** 2 + (cy - radius) ** 2);
      const alpha = inCorner && dist > radius ? 0 : 255;

      const off = y * row + 1 + x * 4;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = alpha;
    }
  }

  // Draw a simple waveform bar in the center (white, semi-transparent)
  const barCount = Math.max(3, Math.floor(size / 6));
  const barW = Math.max(1, Math.floor(size / (barCount * 2.5)));
  const gap = Math.floor((size - barCount * barW) / (barCount + 1));
  const heights = [0.4, 0.65, 0.9, 0.65, 0.4].slice(0, barCount);
  if (heights.length < barCount) heights.push(...Array(barCount - heights.length).fill(0.5));

  for (let i = 0; i < barCount; i++) {
    const bx = gap + i * (barW + gap);
    const bh = Math.round(size * heights[i] * 0.55);
    const by = Math.round((size - bh) / 2);
    for (let py = by; py < by + bh; py++) {
      for (let px = bx; px < bx + barW; px++) {
        if (px < 0 || px >= size || py < 0 || py >= size) continue;
        const off = py * row + 1 + px * 4;
        if (raw[off + 3] === 0) continue; // skip transparent corners
        raw[off] = 255; raw[off + 1] = 255; raw[off + 2] = 255; raw[off + 3] = 230;
      }
    }
  }

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Aether purple gradient: accent → deep
const colors = [[124, 58, 237], [67, 20, 150]];

for (const size of [16, 32, 48, 128]) {
  const png = createPNG(size, colors);
  fs.writeFileSync(`icons/icon${size}.png`, png);
  console.log(`icons/icon${size}.png  (${png.length} bytes)`);
}
console.log('Done.');
