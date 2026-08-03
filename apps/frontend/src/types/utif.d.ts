declare module "utif" {
  export interface UtifIfd {
    width?: number;
    height?: number;
    t256?: number;
    t257?: number;
    [key: string]: unknown;
  }

  export function decode(buffer: ArrayBuffer | Uint8Array): UtifIfd[];
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: UtifIfd): void;
  export function toRGBA8(ifd: UtifIfd): Uint8Array;

  const UTIF: {
    decode: typeof decode;
    decodeImage: typeof decodeImage;
    toRGBA8: typeof toRGBA8;
  };

  export default UTIF;
}
