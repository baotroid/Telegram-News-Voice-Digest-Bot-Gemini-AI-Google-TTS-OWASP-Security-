/**
 * Utility functions for reliable image downloading, format conversion (JPEG/PNG),
 * clipboard copying, and opening in new tabs for Windows, Mac, and mobile environments.
 */

export async function convertImageToBlob(
  imageSrc: string,
  format: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.95
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 1024;
        canvas.height = img.naturalHeight || 1024;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context not available');
        }

        // Fill background for JPEG to avoid black/transparent artifacts
        if (format === 'image/jpeg') {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (blob && blob.size > 0) {
              resolve(blob);
            } else {
              reject(new Error('Canvas toBlob resulted in empty blob'));
            }
          },
          format,
          quality
        );
      } catch (err) {
        // Direct fetch fallback
        fetch(imageSrc)
          .then((res) => res.blob())
          .then((blob) => resolve(blob))
          .catch((fetchErr) => reject(fetchErr));
      }
    };

    img.onerror = () => {
      fetch(imageSrc)
        .then((res) => res.blob())
        .then((blob) => resolve(blob))
        .catch((fetchErr) => reject(fetchErr));
    };

    img.src = imageSrc;
  });
}

export async function downloadImageAsFile(
  imageSrc: string,
  filename: string,
  format: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<boolean> {
  try {
    const blob = await convertImageToBlob(imageSrc, format, 0.95);
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revoke after delay to allow browser download initiation
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 4000);

    return true;
  } catch (error) {
    console.error('Failed to download image file:', error);
    // Fallback: simple anchor click
    const fallbackLink = document.createElement('a');
    fallbackLink.href = imageSrc;
    fallbackLink.download = filename;
    fallbackLink.target = '_blank';
    document.body.appendChild(fallbackLink);
    fallbackLink.click();
    document.body.removeChild(fallbackLink);
    return false;
  }
}

export async function copyImageBlobToClipboard(imageSrc: string): Promise<boolean> {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error('Clipboard API not supported');
    }
    const pngBlob = await convertImageToBlob(imageSrc, 'image/png');
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': pngBlob,
      }),
    ]);
    return true;
  } catch (err) {
    console.warn('Clipboard copy failed:', err);
    return false;
  }
}

export async function openImageInNewTab(imageSrc: string): Promise<void> {
  try {
    const blob = await convertImageToBlob(imageSrc, 'image/jpeg', 0.95);
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  } catch {
    window.open(imageSrc, '_blank');
  }
}
