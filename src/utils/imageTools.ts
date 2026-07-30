export function resizeImageFileToSquare(file: File, size = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please upload a valid image file."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("The image could not be loaded."));
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;

        if (!width || !height) {
          reject(new Error("The image has invalid dimensions."));
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("The image could not be processed."));
          return;
        }

        context.clearRect(0, 0, size, size);

        const scale = Math.max(size / width, size / height);
        const sourceWidth = size / scale;
        const sourceHeight = size / scale;
        const sourceX = Math.max(0, (width - sourceWidth) / 2);
        const sourceY = Math.max(0, (height - sourceHeight) / 2);

        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          size,
          size,
        );

        resolve(canvas.toDataURL("image/png"));
      };
      image.src = String(reader.result || "");
    };

    reader.readAsDataURL(file);
  });
}
