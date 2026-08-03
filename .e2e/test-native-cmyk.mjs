import sharp from "sharp";

const file = "D:/DESENVOLVIMENTO/layout-web/arte_cartao_chave_pd_943_ribalta2_052026_v1.jpg";

const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
console.log("formato raw:", info.format, "canais:", info.channels, "dimensões:", info.width, "x", info.height);

// O arquivo é CMYK (4 canais). Achar os valores CMYK mais comuns.
const hist = new Map();
const stride = 1;
for (let y = 0; y < info.height; y += stride) {
  for (let x = 0; x < info.width; x += stride) {
    const i = (y * info.width + x) * info.channels;
    const c = data[i];
    const m = data[i + 1];
    const yy = data[i + 2];
    const k = data[i + 3];
    const key = `${c},${m},${yy},${k}`;
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
}
const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
for (const [key, count] of top) {
  const [c, m, y, k] = key.split(",").map((n) => Math.round((Number(n) / 255) * 100));
  console.log(`CMYK nativo ${c}%, ${m}%, ${y}%, ${k}%  (pixels: ${count})`);
}
