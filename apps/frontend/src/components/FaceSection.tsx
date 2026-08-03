"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { ErrorBanner } from "@/components/ErrorBanner";
import { ImagePreview } from "@/components/ImagePreview";
import { PaletteStrip } from "@/components/PaletteStrip";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { UploadZone } from "@/components/UploadZone";

import { AnalysisError, analyzeImageData } from "@/lib/color/analysis";
import { rgbToCmykApprox } from "@/lib/color/cmykApprox";
import { imageDataToPngDataUrl } from "@/lib/export/download";
import { ImageLoadError, loadImageFile } from "@/lib/image/loader";
import { saveRemoteFace } from "@/lib/api/client";
import type { RemoteFace } from "@/lib/api/client";
import type {
  AnalysisOptions,
  AnalysisResult,
  Cmyk,
  DominantColor,
  LoadedImage,
  PickerMode,
  Rgb,
} from "@/lib/types";
import type { PickedColor } from "@/components/ImagePreview";

export interface FaceSectionHandle {
  getImage: () => LoadedImage | null;
  addImageFromImage: (source: LoadedImage) => void;
  addBlankFromImage: (source: LoadedImage) => void;
  getChip: () => ChipPosition | null;
  setChip: (position: ChipPosition | null) => void;
  getExportData: () => {
    result: AnalysisResult;
    dataUrl: string;
    image: LoadedImage;
    side: "frente" | "verso";
  } | null;
}

interface FaceSectionProps {
  side: "frente" | "verso";
  jobId: string | null;
  initialFace: RemoteFace | null;
  title: string;
  options: AnalysisOptions;
  customIcc: { buffer: ArrayBuffer; name: string } | null;
  onAddRecipient?: () => void;
  onDuplicateImage?: () => void;
  onImageStateChange?: (hasImage: boolean) => void;
  onChipChange?: (position: ChipPosition | null) => void;
  onNewImage?: (previousChip: ChipPosition | null) => void;
  getOrientationConflict?: (width: number, height: number) => string | null;
  showAddRecipient?: boolean;
}

type Status = "idle" | "processing" | "done" | "error";
type CmykState = "idle" | "loading" | "ready" | "error";
type MagneticStripePosition =
  | "vertical-left"
  | "vertical-right"
  | "horizontal-top"
  | "horizontal-bottom";

const MAGNETIC_STRIPE_OPTIONS: Array<{
  value: MagneticStripePosition;
  label: string;
}> = [
  { value: "vertical-left", label: "Tarja magnética vertical esquerda" },
  { value: "vertical-right", label: "Tarja magnética vertical direita" },
  { value: "horizontal-top", label: "Tarja magnética horizontal superior" },
  { value: "horizontal-bottom", label: "Tarja magnética horizontal inferior" },
];

export type ChipPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CHIP_OPTIONS: Array<{ value: ChipPosition; label: string }> = [
  { value: "top-left", label: "Chip superior esquerdo" },
  { value: "top-right", label: "Chip superior direito" },
  { value: "bottom-left", label: "Chip inferior esquerdo" },
  { value: "bottom-right", label: "Chip inferior direito" },
];

function MagneticStripeIcon({
  position,
  selected,
}: {
  position: MagneticStripePosition;
  selected: boolean;
}) {
  const vertical = position.startsWith("vertical");
  const start =
    position === "vertical-left"
      ? "M12 11v26"
      : position === "vertical-right"
        ? "M36 11v26"
        : position === "horizontal-top"
          ? "M13 12h22"
          : "M13 36h22";

  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-16 w-16" aria-hidden="true">
      <rect
        x="8"
        y="6"
        width="32"
        height="36"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity={selected ? 0.9 : 0.55}
      />
      <path d={start} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path
        d={vertical ? "M14 25h20M14 30h10" : "M18 14h12M18 34h8"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity=".25"
      />
    </svg>
  );
}

function ChipPositionIcon({
  position,
  selected,
}: {
  position: ChipPosition;
  selected: boolean;
}) {
  const chip = (x: number, y: number) => (
    <>
      <rect x={x} y={y} width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d={`M${x + 2.5} ${y}v-4M${x + 6} ${y}v-4M${x + 9.5} ${y}v-4M${x + 2.5} ${y + 12}v4M${x + 6} ${y + 12}v4M${x + 9.5} ${y + 12}v4M${x} ${y + 2.5}h-4M${x} ${y + 6}h-4M${x} ${y + 9.5}h-4M${x + 12} ${y + 2.5}h4M${x + 12} ${y + 6}h4M${x + 12} ${y + 9.5}h4`}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  );

  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-16 w-16" aria-hidden="true">
      <rect
        x="8"
        y="6"
        width="32"
        height="36"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity={selected ? 0.9 : 0.55}
      />
      {position === "top-left" && chip(12, 14)}
      {position === "top-right" && chip(24, 14)}
      {position === "bottom-left" && chip(12, 22)}
      {position === "bottom-right" && chip(24, 22)}
    </svg>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof AnalysisError || error instanceof ImageLoadError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Ocorreu um erro inesperado ao processar a imagem.";
}

export const FaceSection = forwardRef<FaceSectionHandle, FaceSectionProps>(function FaceSection(
  {
    side,
    jobId,
    initialFace,
    title,
    options,
    customIcc,
    onAddRecipient,
    onDuplicateImage,
    onImageStateChange,
    onChipChange,
    onNewImage,
    getOrientationConflict,
    showAddRecipient,
  },
  ref,
) {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [, setCmykState] = useState<CmykState>("idle");
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [mergeMode, setMergeMode] = useState<PickerMode | null>(null);
  const [pickedColors, setPickedColors] = useState<DominantColor[]>([]);
  const [stripeDialogOpen, setStripeDialogOpen] = useState(false);
  const [magneticStripePosition, setMagneticStripePosition] =
    useState<MagneticStripePosition | null>(null);
  const magneticStripeRef = useRef<MagneticStripePosition | null>(null);
  const [chipDialogOpen, setChipDialogOpen] = useState(false);
  const [chipPosition, setChipPosition] = useState<ChipPosition | null>(null);
  const [orientationWarning, setOrientationWarning] = useState<string | null>(null);
  const chipRef = useRef<ChipPosition | null>(null);
  const lastChipRef = useRef<ChipPosition | null>(null);

  const optionsRef = useRef(options);
  const imageRef = useRef<LoadedImage | null>(null);
  const blankRecipientRef = useRef(false);
  const resultRef = useRef<AnalysisResult | null>(null);
  const customIccRef = useRef(customIcc);
  const pickedRef = useRef<DominantColor[]>([]);
  const mergeRef = useRef<PickerMode | null>(null);
  const generationRef = useRef(0);
  const converterRef = useRef<{
    key: string;
    close: () => void;
    convert: (rgbColors: Rgb[]) => Cmyk[];
  } | null>(null);
  const hydratedFaceRef = useRef<string | null>(null);

  useEffect(() => {
    optionsRef.current = options;
    customIccRef.current = customIcc;
  }, [customIcc, options]);

  useEffect(() => {
    if (!initialFace || hydratedFaceRef.current === initialFace.id) return;
    const face = initialFace;
    let cancelled = false;

    async function hydrateFace() {
      try {
        const source = new Image();
        source.src = face.previewDataUrl;
        await new Promise<void>((resolve, reject) => {
          source.onload = () => resolve();
          source.onerror = () => reject(new Error("Não foi possível restaurar a imagem salva."));
        });
        if (cancelled) return;

        const canvas = document.createElement("canvas");
        canvas.width = face.imageWidth;
        canvas.height = face.imageHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Não foi possível restaurar a imagem salva.");
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        const restoredImage: LoadedImage = {
          fileName: face.imageName,
          format: face.format,
          width: face.imageWidth,
          height: face.imageHeight,
          imageData: context.getImageData(0, 0, canvas.width, canvas.height),
          previewUrl: face.previewDataUrl,
          previewUrlShared: true,
          nativeCmyk: null,
          hasNativeCmyk: false,
        };
        const restoredResult: AnalysisResult = {
          ...face.analysis,
          colors: face.colors.length > 0 ? face.colors : face.analysis.colors,
        };

        hydratedFaceRef.current = face.id;
        imageRef.current = restoredImage;
        resultRef.current = restoredResult;
        blankRecipientRef.current = restoredImage.fileName.endsWith("-recipiente.png");
        magneticStripeRef.current = restoredResult.magneticStripePosition as MagneticStripePosition | undefined ?? null;
        chipRef.current = restoredResult.chipPosition as ChipPosition | undefined ?? null;
        setImage(restoredImage);
        setResult(restoredResult);
        setMagneticStripePosition(magneticStripeRef.current);
        setChipPosition(chipRef.current);
        setStatus("done");
        setProgress("");
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(errorMessage(err));
        }
      }
    }

    void hydrateFace();
    return () => {
      cancelled = true;
    };
  }, [initialFace]);

  const convertColors = useCallback(
    async (colors: DominantColor[], opts: AnalysisOptions): Promise<DominantColor[]> => {
      if (colors.every((c) => c.cmykPrint != null)) return colors;

      const custom = customIccRef.current;
      const key =
        opts.iccProfileId === "custom" ? `custom:${custom?.name ?? ""}` : opts.iccProfileId;

      if (opts.iccProfileId === "custom" && !custom) return colors;

      try {
        if (converterRef.current?.key !== key) {
          converterRef.current?.close();
          converterRef.current = null;
          const icc = await import("@/lib/color/icc");
          const converter = await icc.createRgbToCmykConverter(
            opts.iccProfileId,
            custom?.buffer,
            custom?.name,
          );
          converterRef.current = { key, ...converter };
        }

        const cmyks = converterRef.current.convert(colors.map((c) => c.rgb));
        return colors.map((color, index) =>
          color.cmykPrint ? color : { ...color, cmykPrint: cmyks[index] },
        );
      } catch {
        return colors;
      }
    },
    [],
  );

  const applyPrintCmyk = useCallback(
    async (current: AnalysisResult, opts: AnalysisOptions) => {
      const gen = generationRef.current;
      const custom = customIccRef.current;

      if (current.colors.every((c) => c.cmykPrint != null)) {
        setCmykState("ready");
        return;
      }

      if (opts.iccProfileId === "custom" && !custom) {
        setCmykState("idle");
        return;
      }

      setCmykState("loading");
      const updatedColors = await convertColors(current.colors, opts);

      if (gen !== generationRef.current) return;

      const updated = { ...current, colors: updatedColors };
      resultRef.current = updated;
      setResult(updated);
      setCmykState("ready");
    },
    [convertColors],
  );

  const runAnalysis = useCallback(
    async (img: LoadedImage, opts: AnalysisOptions) => {
      const gen = ++generationRef.current;
      setStatus("processing");
      setError(null);
      setCmykState("loading");
      pickedRef.current = [];
      setPickedColors([]);
      mergeRef.current = null;
      setMergeMode(null);
      setPickerMode(null);
      try {
        const res = analyzeImageData(img.imageData, opts, setProgress, img.nativeCmyk);
        res.imageName = img.fileName;
        res.imageWidth = img.width;
        res.imageHeight = img.height;
        res.magneticStripePosition = magneticStripeRef.current ?? undefined;
        res.chipPosition = chipRef.current ?? undefined;

        if (gen !== generationRef.current) return;
        resultRef.current = res;
        setResult(res);
        setStatus("done");
        setProgress("");

        if (jobId) void saveRemoteFace(jobId, side, img, res);

        await applyPrintCmyk(res, opts);
      } catch (err) {
        if (gen !== generationRef.current) return;
        setStatus("error");
        setError(errorMessage(err));
        setProgress("");
      }
    },
    [applyPrintCmyk, jobId, side],
  );

  const handleFile = useCallback(
    async (file: File) => {
      ++generationRef.current;
      const previousChip = lastChipRef.current;
      setStatus("processing");
      setError(null);
      setProgress("");

       if (imageRef.current?.previewUrl.startsWith("blob:") && !imageRef.current.previewUrlShared) {
        URL.revokeObjectURL(imageRef.current.previewUrl);
      }

      try {
        const loaded = await loadImageFile(file, setProgress);
        const conflict = getOrientationConflict?.(loaded.width, loaded.height);
        if (conflict) {
          if (loaded.previewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(loaded.previewUrl);
          }
          setOrientationWarning(conflict);
          setStatus("idle");
          setError(null);
          setProgress("");
          return;
        }
        blankRecipientRef.current = false;
        magneticStripeRef.current = null;
        setMagneticStripePosition(null);
        chipRef.current = null;
        setChipPosition(null);
        imageRef.current = loaded;
        setImage(loaded);
        await runAnalysis(loaded, optionsRef.current);
        onNewImage?.(previousChip);
      } catch (err) {
        setStatus("error");
        setError(errorMessage(err));
      }
    },
    [runAnalysis, getOrientationConflict],
  );

  const handleRemoveImage = useCallback(() => {
    ++generationRef.current;

    const currentImage = imageRef.current;
    if (currentImage?.previewUrl.startsWith("blob:") && !currentImage.previewUrlShared) {
      URL.revokeObjectURL(currentImage.previewUrl);
    }

    converterRef.current?.close();
    converterRef.current = null;
    imageRef.current = null;
    blankRecipientRef.current = false;
    magneticStripeRef.current = null;
    chipRef.current = null;
    resultRef.current = null;
    pickedRef.current = [];
    mergeRef.current = null;

    setImage(null);
    setResult(null);
    setPickedColors([]);
    setPickerMode(null);
    setMergeMode(null);
    setMagneticStripePosition(null);
    setChipPosition(null);
    setCmykState("idle");
    setStatus("idle");
    setProgress("");
    setError(null);
  }, []);

  const addBlankFromImage = useCallback(
    (source: LoadedImage) => {
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const context = canvas.getContext("2d");
      if (!context) return;

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "#000000";
      context.lineWidth = 1;
      const radius = Math.min(canvas.width, canvas.height) * 0.07;
      const inset = 1;
      context.beginPath();
      context.roundRect(
        inset,
        inset,
        Math.max(0, canvas.width - inset * 2),
        Math.max(0, canvas.height - inset * 2),
        Math.max(0, radius - inset),
      );
      context.stroke();

      const blank: LoadedImage = {
        fileName: `${source.fileName.replace(/\.[^.]+$/, "")}-recipiente.png`,
        format: "png",
        width: canvas.width,
        height: canvas.height,
        imageData: context.getImageData(0, 0, canvas.width, canvas.height),
        previewUrl: canvas.toDataURL("image/png"),
        nativeCmyk: null,
        hasNativeCmyk: false,
      };

      imageRef.current = blank;
      blankRecipientRef.current = true;
      const blankResult: AnalysisResult = {
        colors: [],
        mode: optionsRef.current.mode,
        options: optionsRef.current,
        totalPixels: canvas.width * canvas.height,
        sampledPixels: canvas.width * canvas.height,
        profileName: "Recipiente em branco",
        imageName: blank.fileName,
        imageWidth: blank.width,
        imageHeight: blank.height,
        magneticStripePosition: magneticStripeRef.current ?? undefined,
        chipPosition: chipRef.current ?? undefined,
      };
      resultRef.current = blankResult;
      setImage(blank);
      setResult(blankResult);
      setStatus("done");
      setProgress("");
      setError(null);
    },
    [],
  );

  const addImageFromImage = useCallback(
    (source: LoadedImage) => {
      const imageData = new ImageData(
        new Uint8ClampedArray(source.imageData.data),
        source.width,
        source.height,
      );
      source.previewUrlShared = true;

      const copy: LoadedImage = {
        ...source,
        fileName: `${source.fileName.replace(/\.[^.]+$/, "")}-copia.${source.format}`,
        imageData,
        previewUrl: source.previewUrl,
        previewUrlShared: true,
        nativeCmyk: source.nativeCmyk ? new Uint8Array(source.nativeCmyk) : null,
      };

      blankRecipientRef.current = false;
      magneticStripeRef.current = null;
      setMagneticStripePosition(null);
      chipRef.current = null;
      setChipPosition(null);
      imageRef.current = copy;
      setImage(copy);
      void runAnalysis(copy, optionsRef.current);
    },
    [runAnalysis],
  );

  useEffect(() => {
    onImageStateChange?.(Boolean(image));
  }, [image, onImageStateChange]);

  useEffect(() => {
    if (!imageRef.current || blankRecipientRef.current) return;
    void runAnalysis(imageRef.current, options);
  }, [options, runAnalysis]);

  useEffect(() => {
    if (blankRecipientRef.current) return;
    if (resultRef.current) void applyPrintCmyk(resultRef.current, options);
    if (pickedRef.current.length > 0) {
      setCmykState("loading");
      void convertColors(pickedRef.current, options).then((updated) => {
        pickedRef.current = updated;
        setPickedColors(updated);
        setCmykState("ready");
      });
    }
  }, [applyPrintCmyk, convertColors, customIcc, options]);

  const handleNameChange = useCallback((index: number, name: string) => {
    const base = resultRef.current;
    const picked = pickedRef.current;

    if (picked.length > 0 && mergeRef.current === "append" && base) {
      if (index < base.colors.length) {
        const updatedColors = base.colors.map((color, i) =>
          i === index ? { ...color, name } : color,
        );
        const updated = { ...base, colors: updatedColors };
        resultRef.current = updated;
        setResult(updated);
        return;
      }
      const pickedIndex = index - base.colors.length;
      const updated = picked.map((color, i) =>
        i === pickedIndex ? { ...color, name } : color,
      );
      pickedRef.current = updated;
      setPickedColors(updated);
      return;
    }

    if (picked.length > 0) {
      const updated = picked.map((color, i) =>
        i === index ? { ...color, name } : color,
      );
      pickedRef.current = updated;
      setPickedColors(updated);
      return;
    }

    if (!base) return;
    const updatedColors = base.colors.map((color, i) =>
      i === index ? { ...color, name } : color,
    );
    const updated = { ...base, colors: updatedColors };
    resultRef.current = updated;
    setResult(updated);
  }, []);

  const handleRemoveColor = useCallback((index: number) => {
    const base = resultRef.current;
    const picked = pickedRef.current;

    if (picked.length > 0 && mergeRef.current === "append" && base) {
      if (index < base.colors.length) {
        const updatedColors = base.colors.filter((_, i) => i !== index);
        const updated = { ...base, colors: updatedColors };
        resultRef.current = updated;
        setResult(updated);
        return;
      }
      const pickedIndex = index - base.colors.length;
      const updated = picked
        .filter((_, i) => i !== pickedIndex)
        .map((color, i) => ({ ...color, rank: i + 1 }));
      pickedRef.current = updated;
      setPickedColors(updated);
      return;
    }

    if (picked.length > 0) {
      const updated = picked
        .filter((_, i) => i !== index)
        .map((color, i) => ({ ...color, rank: i + 1 }));
      pickedRef.current = updated;
      setPickedColors(updated);
      return;
    }

    if (!base) return;
    const updatedColors = base.colors.filter((_, i) => i !== index);
    const updated = {
      ...base,
      colors: updatedColors.map((color, i) => ({ ...color, rank: i + 1 })),
    };
    resultRef.current = updated;
    setResult(updated);
  }, []);

  const handleTogglePicker = useCallback((mode: PickerMode) => {
    setPickerMode((prev) => (prev === mode ? null : mode));
  }, []);

  const handlePick = useCallback(
    (picked: PickedColor) => {
      const gen = generationRef.current;

      if (pickerMode) {
        mergeRef.current = pickerMode;
        setMergeMode(pickerMode);
      }

      const existing = pickedRef.current.some((c) => c.hex === picked.hex);
      if (existing) return;

      const color: DominantColor = {
        rank: pickedRef.current.length + 1,
        hex: picked.hex,
        rgb: picked.rgb,
        cmykApprox: rgbToCmykApprox(picked.rgb),
        cmykPrint: picked.cmyk ?? null,
        percentage: 0,
        score: 0,
        modePurity: 1,
        manual: true,
        name: "",
        x: picked.x,
        y: picked.y,
      };

      const next = [...pickedRef.current, color];
      pickedRef.current = next;
      setPickedColors(next);
      setError(null);

      if (!color.cmykPrint) {
        setCmykState("loading");
        void convertColors([color], optionsRef.current).then((converted) => {
          if (gen !== generationRef.current) return;
          const updated = pickedRef.current.map((c) =>
            c.hex === color.hex ? converted[0] : c,
          );
          pickedRef.current = updated;
          setPickedColors(updated);
          setCmykState("ready");
        });
      }
    },
    [convertColors, pickerMode],
  );

  const applyChip = useCallback((position: ChipPosition | null) => {
    lastChipRef.current = position;
    chipRef.current = position;
    setChipPosition(position);
    if (resultRef.current) {
      const updated = { ...resultRef.current, chipPosition: position ?? undefined };
      resultRef.current = updated;
      setResult(updated);
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getImage: () => imageRef.current,
      addImageFromImage,
      addBlankFromImage,
      getChip: () => chipRef.current,
      setChip: applyChip,
      getExportData: () => {
        const currentResult = resultRef.current;
        const currentImage = imageRef.current;
        if (!currentResult || !currentImage) return null;

        const manualColors = pickedRef.current;
        const colors =
          manualColors.length > 0 && mergeRef.current === "append"
            ? [...currentResult.colors, ...manualColors]
            : manualColors.length > 0
              ? manualColors
              : currentResult.colors;

        return {
          result: { ...currentResult, colors },
          dataUrl: imageDataToPngDataUrl(currentImage.imageData),
          image: currentImage,
          side,
        };
      },
    }),
    [addBlankFromImage, addImageFromImage, applyChip, side],
  );

  const processing = status === "processing";

  const handleRemoveStripe = () => {
    magneticStripeRef.current = null;
    setMagneticStripePosition(null);
    if (resultRef.current) {
      const updated = { ...resultRef.current, magneticStripePosition: undefined };
      resultRef.current = updated;
      setResult(updated);
    }
    setStripeDialogOpen(false);
  };

  const handleRemoveChip = () => {
    lastChipRef.current = null;
    chipRef.current = null;
    setChipPosition(null);
    onChipChange?.(null);
    if (resultRef.current) {
      const updated = { ...resultRef.current, chipPosition: undefined };
      resultRef.current = updated;
      setResult(updated);
    }
    setChipDialogOpen(false);
  };

  const displayColors: DominantColor[] = result
    ? pickedColors.length > 0 && mergeMode === "append"
      ? [...result.colors, ...pickedColors]
      : pickedColors.length > 0
        ? pickedColors
        : result.colors
    : [];

  const manualCount = pickedColors.length;
  const isManual = manualCount > 0;
  const isAppend = isManual && mergeMode === "append";

  const isVerticalImage = image ? image.height > image.width : false;
  const isHorizontalImage = image ? image.width > image.height : false;
  const isStripeAllowed = (value: MagneticStripePosition) => {
    if (isVerticalImage && value.startsWith("horizontal")) return false;
    if (isHorizontalImage && value.startsWith("vertical")) return false;
    return true;
  };

  const chipConflictsWithStripe = (
    chip: ChipPosition,
    stripe: MagneticStripePosition | null,
  ): boolean => {
    if (!stripe) return false;
    const chipOnTop = chip === "top-left" || chip === "top-right";
    const chipOnBottom = chip === "bottom-left" || chip === "bottom-right";
    const chipOnLeft = chip === "top-left" || chip === "bottom-left";
    const chipOnRight = chip === "top-right" || chip === "bottom-right";
    switch (stripe) {
      case "vertical-left":
        return chipOnLeft;
      case "vertical-right":
        return chipOnRight;
      case "horizontal-top":
        return chipOnTop;
      case "horizontal-bottom":
        return chipOnBottom;
      default:
        return false;
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-slate-800 px-5 py-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white">{title}</h2>
        {image ? (
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="h-7 w-16 shrink-0 rounded-md border border-white/15 bg-white/5"
            >
              <button
                type="button"
                onClick={() => setStripeDialogOpen(true)}
                aria-label="Adicionar tarja magnética"
                title={
                  magneticStripePosition
                    ? "Alterar posição da tarja magnética"
                    : "Adicionar tarja magnética"
                }
                className={`flex h-full w-full items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/90 ${
                  magneticStripePosition
                    ? "bg-amber-400/30 text-amber-200 hover:bg-amber-400/45"
                    : "text-slate-300 hover:bg-white/10 hover:text-amber-200"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 9h18M7 15h4" strokeLinecap="round" />
                </svg>
              </button>
            </span>
            <span
              className="h-7 w-16 shrink-0 rounded-md border border-white/15 bg-white/5"
            >
              <button
                type="button"
                onClick={() => setChipDialogOpen(true)}
                aria-label="Adicionar chip RFID"
                title={
                  chipPosition
                    ? "Alterar posição do chip"
                    : "Adicionar chip RFID"
                }
                className={`flex h-full w-full items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/90 ${
                  chipPosition
                    ? "bg-emerald-400/30 text-emerald-200 hover:bg-emerald-400/45"
                    : "text-slate-300 hover:bg-white/10 hover:text-emerald-200"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <rect x="8" y="8" width="8" height="8" rx="1.5" />
                  <path
                    d="M10.5 8V4.5M13.5 8V4.5M10.5 19.5V16M13.5 19.5V16M8 10.5H4.5M8 13.5H4.5M19.5 10.5H16M19.5 13.5H16"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
            {showAddRecipient && (
              <button
                type="button"
                onClick={onDuplicateImage}
                className="shrink-0 rounded-md border border-emerald-300/50 bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-100 transition-colors hover:border-emerald-200/70 hover:bg-emerald-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/80"
              >
                Duplicar Imagem
              </button>
            )}
            <button
              type="button"
              onClick={handleRemoveImage}
              className="shrink-0 rounded-md border border-rose-300/50 bg-rose-500/20 px-2 py-1 text-[11px] font-semibold text-rose-100 transition-colors hover:border-rose-200/70 hover:bg-rose-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/80"
            >
              Remover Imagem
            </button>
            {showAddRecipient && (
              <button
                type="button"
                onClick={onAddRecipient}
                className="shrink-0 rounded-md border border-sky-300/50 bg-sky-500/20 px-2 py-1 text-[11px] font-semibold text-sky-100 transition-colors hover:border-sky-200/70 hover:bg-sky-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80"
              >
                Adicionar Layout
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="p-5">
        {error && !processing && (
          <div className="mb-4">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {!image ? (
          <div className="relative">
            <UploadZone onFile={handleFile} busy={processing} />
            {processing && (
              <ProcessingOverlay title="Processando imagem…" step={progress} />
            )}
          </div>
        ) : (
          <div className="relative space-y-5">
            {status === "error" && error && (
              <ErrorBanner message={error} onDismiss={() => setError(null)} />
            )}

            {result ? (
              <>
                <div className="grid items-start gap-5 md:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
                    <ImagePreview
                      image={image}
                      magneticStripePosition={magneticStripePosition}
                      chipPosition={chipPosition}
                      pickerMode={pickerMode}
                    onTogglePicker={handleTogglePicker}
                    onPick={handlePick}
                  />

                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="text-base font-bold tracking-tight text-slate-900">
                        {isManual ? "Paleta de cores" : "Paleta identificada"}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {isManual
                          ? isAppend
                            ? `${displayColors.length} cor(es) na paleta (${result.colors.length} automáticas + ${manualCount} do conta-gotas)`
                            : `${manualCount} cor(es) selecionadas com o conta-gotas`
                          : `${result.colors.length} cor(es) entre ${result.sampledPixels.toLocaleString("pt-BR")} pixels amostrados · ${
                              result.mode === "predominantes"
                                ? "por área ocupada"
                                : "por destaque visual"
                            }`}
                      </p>
                    </div>
                    <PaletteStrip
                      colors={displayColors}
                      onRemove={handleRemoveColor}
                      onNameChange={handleNameChange}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="relative flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
                <ProcessingOverlay title="Analisando imagem…" step={progress} />
              </div>
            )}

            {processing && result && (
              <ProcessingOverlay title="Reanalisando…" step={progress} />
            )}
          </div>
        )}
      </div>

      {stripeDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setStripeDialogOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-stripe-title`}
          >
            <div className="relative overflow-hidden border-b border-slate-100 px-6 py-5">
              <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-amber-200/45 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-600">
                  Acabamento magnético · {title}
                </p>
                <h3
                  id={`${title.replace(/\s+/g, "-").toLowerCase()}-stripe-title`}
                  className="mt-1 text-xl font-bold tracking-tight text-slate-900"
                >
                  Adicionar tarja magnética
                </h3>
                <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
                  {isVerticalImage
                    ? "Imagem vertical: apenas tarjas verticais são compatíveis."
                    : isHorizontalImage
                      ? "Imagem horizontal: apenas tarjas horizontais são compatíveis."
                      : "Escolha a orientação da tarja para este layout."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleRemoveStripe}
                  disabled={!magneticStripePosition}
                  className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remover tarja
                </button>
                <button
                  type="button"
                  onClick={() => setStripeDialogOpen(false)}
                  aria-label="Fechar seleção de tarja magnética"
                  className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 12" />
                  </svg>
                </button>
              </div>
            </div>
            </div>

            <div className="grid gap-3 p-6 sm:grid-cols-2">
              {MAGNETIC_STRIPE_OPTIONS.map((option) => {
                const orientationBlocked = !isStripeAllowed(option.value);
                const chipConflict = chipPosition
                  ? chipConflictsWithStripe(chipPosition, option.value)
                  : false;
                const allowed = !orientationBlocked && !chipConflict;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={!allowed}
                    onClick={() => {
                      magneticStripeRef.current = option.value;
                      setMagneticStripePosition(option.value);
                      if (chipPosition && chipConflictsWithStripe(chipPosition, option.value)) {
                        chipRef.current = null;
                        setChipPosition(null);
                        onChipChange?.(null);
                      }
                      if (resultRef.current) {
                        const updated = {
                          ...resultRef.current,
                          magneticStripePosition: option.value,
                        };
                        resultRef.current = updated;
                        setResult(updated);
                      }
                      setStripeDialogOpen(false);
                    }}
                    title={
                      orientationBlocked
                        ? "Orientação incompatível com esta imagem"
                        : chipConflict
                          ? "Lado ocupado pelo chip"
                          : undefined
                    }
                    className={`group flex min-h-36 flex-col items-center justify-between rounded-2xl border p-4 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40 ${
                      magneticStripePosition === option.value
                        ? "border-amber-400 bg-amber-50 text-amber-800 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                    }`}
                  >
                    <span className="text-amber-600 transition-transform group-hover:scale-105">
                      <MagneticStripeIcon
                        position={option.value}
                        selected={magneticStripePosition === option.value}
                      />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-[0.08em]">
                      {option.label.replace("Tarja magnética ", "")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {chipDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setChipDialogOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-chip-title`}
          >
            <div className="relative overflow-hidden border-b border-slate-100 px-6 py-5">
              <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-emerald-200/45 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-600">
                    Acabamento de chip · {title}
                  </p>
                  <h3
                    id={`${title.replace(/\s+/g, "-").toLowerCase()}-chip-title`}
                    className="mt-1 text-xl font-bold tracking-tight text-slate-900"
                  >
                    Adicionar chip
                  </h3>
                  <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
                    Escolha a posição do chip para este layout.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRemoveChip}
                    disabled={!chipPosition}
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remover chip
                  </button>
                  <button
                    type="button"
                    onClick={() => setChipDialogOpen(false)}
                    aria-label="Fechar seleção de chip"
                    className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-6 sm:grid-cols-2">
              {CHIP_OPTIONS.map((option) => {
                const conflict = chipConflictsWithStripe(option.value, magneticStripePosition);
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={conflict}
                    onClick={() => {
                      chipRef.current = option.value;
                      setChipPosition(option.value);
                      onChipChange?.(option.value);
                      if (resultRef.current) {
                        const updated = {
                          ...resultRef.current,
                          chipPosition: option.value,
                        };
                        resultRef.current = updated;
                        setResult(updated);
                      }
                      setChipDialogOpen(false);
                    }}
                    title={conflict ? "Lado ocupado pela tarja magnética" : undefined}
                    className={`group flex min-h-36 flex-col items-center justify-between rounded-2xl border p-4 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 ${
                      chipPosition === option.value
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                    }`}
                  >
                    <span className="text-emerald-600 transition-transform group-hover:scale-105">
                      <ChipPositionIcon
                        position={option.value}
                        selected={chipPosition === option.value}
                      />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-[0.08em]">
                      {option.label.replace("Chip ", "")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {orientationWarning && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOrientationWarning(null);
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-orientation-title`}
          >
            <div className="relative overflow-hidden border-b border-slate-100 px-6 py-5">
              <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-amber-200/45 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-600">
                    Atenção · {title}
                  </p>
                  <h3
                    id={`${title.replace(/\s+/g, "-").toLowerCase()}-orientation-title`}
                    className="mt-1 text-xl font-bold tracking-tight text-slate-900"
                  >
                    Orientação incompatível
                  </h3>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
                    {orientationWarning}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOrientationWarning(null)}
                  aria-label="Fechar aviso de orientação"
                  className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6">
              <button
                type="button"
                onClick={() => setOrientationWarning(null)}
                className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
