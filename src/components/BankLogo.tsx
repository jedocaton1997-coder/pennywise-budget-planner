import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { getBankById } from "../data/banks";
import { findBankMatch } from "../utils/bankMatcher";

async function cropUploadedLogo(source: string): Promise<{ source: string; color: string | null }> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Logo could not be loaded."));
    element.src = source;
  });

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) return { source, color: null };
  sourceContext.drawImage(image, 0, 0);

  const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  let left = sourceCanvas.width;
  let top = sourceCanvas.height;
  let right = -1;
  let bottom = -1;
  const colors = new Map<string, number>();

  for (let y = 0; y < sourceCanvas.height; y += 1) {
    for (let x = 0; x < sourceCanvas.width; x += 1) {
      const index = (y * sourceCanvas.width + x) * 4;
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      const alpha = pixels.data[index + 3];
      const isVisibleArtwork = alpha > 20 && !(red > 242 && green > 242 && blue > 242);
      if (isVisibleArtwork) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
        const key = `${Math.round(red / 24) * 24},${Math.round(green / 24) * 24},${Math.round(blue / 24) * 24}`;
        colors.set(key, (colors.get(key) ?? 0) + 1);
      }
    }
  }

  if (right < left || bottom < top) return { source, color: null };

  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const outputSize = 192;
  const output = document.createElement("canvas");
  output.width = outputSize;
  output.height = outputSize;
  const outputContext = output.getContext("2d");
  if (!outputContext) return { source, color: null };

  const scale = Math.max(outputSize / cropWidth, outputSize / cropHeight);
  const width = cropWidth * scale;
  const height = cropHeight * scale;
  outputContext.drawImage(
    sourceCanvas,
    left,
    top,
    cropWidth,
    cropHeight,
    (outputSize - width) / 2,
    (outputSize - height) / 2,
    width,
    height,
  );
  const dominant = [...colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const color = dominant
    ? `#${dominant.split(",").map((value) => Math.min(255, Number(value)).toString(16).padStart(2, "0")).join("")}`
    : null;
  return { source: output.toDataURL("image/webp", 0.9), color };
}

type BankLogoProps = {
  bankId?: string | null;
  bankName?: string;
  size?: "small" | "medium" | "large";
  className?: string;
  customLogo?: string;
  onColorDetected?: (color: string) => void;
};

export function BankLogo({
  bankId = null,
  bankName = "",
  size = "medium",
  className = "",
  customLogo = "",
  onColorDetected,
}: BankLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [processedCustomLogo, setProcessedCustomLogo] = useState("");

  const bank = getBankById(bankId) ?? findBankMatch(bankName);
  const visibleName =
    bank?.shortName || bankName.trim() || "Bank";

  useEffect(() => {
    setImageFailed(false);
  }, [bank?.logoPath, customLogo]);

  useEffect(() => {
    let cancelled = false;
    if (!customLogo) {
      setProcessedCustomLogo("");
      return () => { cancelled = true; };
    }
    cropUploadedLogo(customLogo)
      .then((result) => {
        if (!cancelled) {
          setProcessedCustomLogo(result.source);
          if (result.color) onColorDetected?.(result.color);
        }
      })
      .catch(() => {
        if (!cancelled) setProcessedCustomLogo(customLogo);
      });
    return () => { cancelled = true; };
  }, [customLogo]);

  useEffect(() => {
    if (!customLogo && bank?.primaryColor) onColorDetected?.(bank.primaryColor);
  }, [bank?.primaryColor, customLogo]);

  const classNames = [
    "bank-logo",
    `bank-logo--${size}`,
    customLogo && "bank-logo--custom",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if ((!bank && !customLogo) || imageFailed) {
    return (
      <div
        className={`${classNames} bank-logo--fallback`}
        role="img"
        aria-label={`${visibleName} logo`}
        title={visibleName}
      >
        <Landmark aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className={classNames}
      title={bank?.displayName || visibleName}
    >
      <img
        src={processedCustomLogo || customLogo || bank?.logoPath}
        alt={`${bank?.displayName || visibleName} logo`}
        onError={() => setImageFailed(true)}
      />
    </div>
  );
}
