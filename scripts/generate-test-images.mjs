import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "test-images");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- paleta.png: bloco maior azul, depois vermelho, amarelo, verde, preto, roxo
{
  const W = 600;
  const H = 400;
  const px = Buffer.alloc(W * H * 4, 255); // fundo branco opaco
  const fill = (x0, y0, x1, y1, [r, g, b]) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = b;
        px[i + 3] = 255;
      }
    }
  };
  fill(0, 0, 320, 400, [0, 87, 168]); // azul 53% da área
  fill(320, 0, 440, 200, [230, 57, 70]); // vermelho ~10%
  fill(320, 200, 440, 400, [255, 209, 0]); // amarelo ~10%
  fill(440, 0, 520, 200, [0, 168, 120]); // verde ~6,7%
  fill(440, 200, 520, 400, [17, 17, 17]); // preto ~6,7%
  fill(520, 0, 600, 400, [109, 40, 217]); // roxo ~13,3%
  writeFileSync(join(outDir, "paleta.png"), encodePng(W, H, px));
  console.log("paleta.png");
}

// ---- transparente.png: fundo totalmente transparente, círculo vermelho semi-opaco
{
  const W = 400;
  const H = 400;
  const px = Buffer.alloc(W * H * 4, 0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - W / 2;
      const dy = y - H / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * W + x) * 4;
      if (dist < 120) {
        px[i] = 220;
        px[i + 1] = 40;
        px[i + 2] = 60;
        px[i + 3] = 255;
      } else if (dist < 150) {
        // borda anti-alias semi-transparente
        px[i] = 220;
        px[i + 1] = 40;
        px[i + 2] = 60;
        px[i + 3] = 120;
      }
    }
  }
  writeFileSync(join(outDir, "transparente.png"), encodePng(W, H, px));
  console.log("transparente.png");
}

// ---- gradiente.png: degradê RGB
{
  const W = 400;
  const H = 300;
  const px = Buffer.alloc(W * H * 4, 255);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      px[i] = Math.round((x / W) * 255);
      px[i + 1] = Math.round((y / H) * 255);
      px[i + 2] = 128;
      px[i + 3] = 255;
    }
  }
  writeFileSync(join(outDir, "gradiente.png"), encodePng(W, H, px));
  console.log("gradiente.png");
}

console.log("ok");
