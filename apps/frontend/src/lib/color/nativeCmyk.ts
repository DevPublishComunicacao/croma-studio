import jpegDecoder from "@/lib/color/vendor/jpeg-decoder.cjs";

interface JpegImageInstance {
  parse: (data: Uint8Array) => void;
  width: number;
  height: number;
  components: Array<{ scaleX: number; scaleY: number }>;
  getData: (width: number, height: number) => Uint8Array;
  adobe: { transformCode: number } | null;
}

type JpegImageModule = {
  JpegImage: (new () => JpegImageInstance) & { resetMaxMemoryUsage: (bytes: number) => void };
};

const JpegImage = (jpegDecoder as unknown as JpegImageModule).JpegImage;

const MAX_MEMORY_BYTES = 1024 * 1024 * 1024;

export interface NativeCmykDecode {
  width: number;
  height: number;
  cmyk: Uint8Array;
}

export function isCmykJpeg(data: Uint8Array): boolean {
  if (data[0] !== 0xff || data[1] !== 0xd8) return false;

  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = data[offset + 1];
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) break;
    const length = (data[offset + 2] << 8) | data[offset + 3];
    if (length < 2) break;

    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return data[offset + 9] === 4;
    }
    offset += 2 + length;
  }

  return false;
}

export function decodeNativeCmyk(data: Uint8Array): NativeCmykDecode | null {
  try {
    JpegImage.resetMaxMemoryUsage(MAX_MEMORY_BYTES);
    const decoder = new JpegImage();
    (decoder as unknown as { opts: Record<string, unknown> }).opts = {
      maxResolutionInMP: 100,
      maxMemoryUsageInMB: 1024,
    };
    decoder.parse(data);

    if (decoder.components.length !== 4) return null;

    const { width, height } = decoder;
    const raw = decoder.getData(width, height);
    const cmyk = new Uint8Array(raw.length);
    cmyk.set(raw);

    return { width, height, cmyk };
  } catch {
    return null;
  }
}

export function nativeCmykToCmyk(channel: number): number {
  return Math.round((channel / 255) * 100);
}

export function nativeCmykToSrgb(
  native: Uint8Array,
  width: number,
  height: number,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < native.length; i += 4, j += 4) {
    const c = native[i] / 255;
    const m = native[i + 1] / 255;
    const y = native[i + 2] / 255;
    const k = native[i + 3] / 255;
    data[j] = Math.round(255 * (1 - c) * (1 - k));
    data[j + 1] = Math.round(255 * (1 - m) * (1 - k));
    data[j + 2] = Math.round(255 * (1 - y) * (1 - k));
    data[j + 3] = 255;
  }
  return new ImageData(data, width, height);
}
