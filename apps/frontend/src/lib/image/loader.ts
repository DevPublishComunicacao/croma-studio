import { decodeNativeCmyk, isCmykJpeg, nativeCmykToSrgb } from "@/lib/color/nativeCmyk";
import type { LoadedImage } from "@/lib/types";

const MAX_DIMENSION = 1600;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/x-tiff",
]);
const ALLOWED_EXT = /\.(jpe?g|png|webp|tif|tiff)$/i;

export interface LoadProgressFn {
  (step: string): void;
}

export class ImageLoadError extends Error {}

export function detectFormat(file: File): string {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === "image/tiff" || type === "image/x-tiff" || /\.(tif|tiff)$/.test(name)) {
    return "tiff";
  }
  if (type) return type;
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  return "desconhecido";
}

async function decodeTiff(buffer: ArrayBuffer): Promise<HTMLCanvasElement> {
  const { default: UTIF } = await import("utif");
  const ifds = UTIF.decode(buffer);
  if (!ifds || ifds.length === 0) {
    throw new ImageLoadError("Não foi possível interpretar este arquivo TIFF.");
  }

  const ifd = ifds[0];
  UTIF.decodeImage(buffer, ifd);

  const width = ifd.width ?? ifd.t256 ?? 0;
  const height = ifd.height ?? ifd.t257 ?? 0;
  if (!width || !height) {
    throw new ImageLoadError("As dimensões deste TIFF não puderam ser lidas.");
  }

  const rgba = UTIF.toRGBA8(ifd);
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new ImageLoadError("Seu navegador não suporta processamento de imagens.");
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function fitWithin(width: number, height: number, maxDim: number) {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function loadImageFile(
  file: File,
  onProgress?: LoadProgressFn,
): Promise<LoadedImage> {
  const mimeOk = ALLOWED_MIME.has(file.type.toLowerCase());
  const extOk = ALLOWED_EXT.test(file.name.toLowerCase());

  if (!mimeOk && !extOk) {
    throw new ImageLoadError(
      "Formato não suportado. Envie uma imagem JPG, JPEG, PNG, WEBP ou TIFF.",
    );
  }

  const format = detectFormat(file);
  const buffer = await file.arrayBuffer();

  let source: CanvasImageSource;
  let naturalWidth: number;
  let naturalHeight: number;
  let previewUrl: string;

  if (format === "tiff") {
    onProgress?.("Decodificando imagem TIFF…");
    const full = await decodeTiff(buffer);
    source = full;
    naturalWidth = full.width;
    naturalHeight = full.height;
    previewUrl = "";
  } else {
    onProgress?.("Carregando imagem…");
    try {
      const blob = new Blob([buffer], {
        type: file.type || "application/octet-stream",
      });
      source = await createImageBitmap(blob);
    } catch {
      throw new ImageLoadError(
        "Não foi possível decodificar esta imagem. O arquivo pode estar corrompido.",
      );
    }
    naturalWidth = (source as ImageBitmap).width;
    naturalHeight = (source as ImageBitmap).height;
    previewUrl = "";
  }

  const { width, height } = fitWithin(naturalWidth, naturalHeight, MAX_DIMENSION);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new ImageLoadError("Seu navegador não suporta processamento de imagens.");
  }

  onProgress?.("Redimensionando imagem para análise…");
  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);

  // Render the decoded canvas instead of the original file URL. This also
  // supports images whose MIME/profile the browser cannot display directly.
  previewUrl = canvas.toDataURL("image/png");

  let nativeCmyk: Uint8Array | null = null;
  let hasNativeCmyk = false;
  if (format === "image/jpeg") {
    onProgress?.("Detectando cores CMYK nativas do arquivo…");
    const bytes = new Uint8Array(buffer);
    if (isCmykJpeg(bytes)) {
      const decoded = decodeNativeCmyk(bytes);
      if (decoded) {
        hasNativeCmyk = true;
        nativeCmyk = scaleNativeCmyk(
          decoded.cmyk,
          decoded.width,
          decoded.height,
          width,
          height,
        );
      }
    }
  }

  let analysisImageData = imageData;
  if (hasNativeCmyk && nativeCmyk) {
    onProgress?.("Convertendo CMYK nativo para análise…");
    analysisImageData = nativeCmykToSrgb(nativeCmyk, width, height);
  }

  if (source instanceof ImageBitmap) {
    source.close();
  }

  return {
    fileName: file.name,
    format,
    width,
    height,
    imageData: analysisImageData,
    previewUrl,
    nativeCmyk,
    hasNativeCmyk,
  };
}

function scaleNativeCmyk(
  source: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8Array {
  if (srcWidth === dstWidth && srcHeight === dstHeight) return source;

  const out = new Uint8Array(dstWidth * dstHeight * 4);
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;

  for (let y = 0; y < dstHeight; y++) {
    const srcY = Math.min(srcHeight - 1, Math.floor(y * yRatio));
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.min(srcWidth - 1, Math.floor(x * xRatio));
      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = (y * dstWidth + x) * 4;
      out[dstIdx] = source[srcIdx];
      out[dstIdx + 1] = source[srcIdx + 1];
      out[dstIdx + 2] = source[srcIdx + 2];
      out[dstIdx + 3] = source[srcIdx + 3];
    }
  }

  return out;
}
