/** Crop the right 50% of an image file (client-side). */
export async function cropImageRightHalf(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const half = Math.floor(img.width / 2);
    const width = img.width - half;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    ctx.drawImage(img, half, 0, width, img.height, 0, 0, width, img.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Crop failed"))),
        "image/png"
      );
    });

    return new File([blob], "chart-right-half.png", { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Crop the left 50% of an image file (client-side). */
export async function cropImageLeftHalf(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const width = Math.floor(img.width / 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    ctx.drawImage(img, 0, 0, width, img.height, 0, 0, width, img.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Crop failed"))),
        "image/png"
      );
    });

    return new File([blob], "chart-left-half.png", { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
