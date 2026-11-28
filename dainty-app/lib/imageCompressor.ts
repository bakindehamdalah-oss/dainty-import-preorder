/**
 * Zero-cost client-side image compression utility.
 * Optimizes images in the browser before uploading to Supabase Storage.
 * Reduces 3MB-8MB phone camera pictures to ~60KB-120KB WebP/JPEG,
 * dramatically slashing Supabase storage size, bandwidth, and cached egress.
 */

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number;
  targetFormat?: 'image/webp' | 'image/jpeg';
}

export async function compressImageFile(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file;
  }

  // Preserve vector and animated images
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  const {
    maxDimension = 1200,
    quality = 0.82,
    targetFormat = 'image/webp',
  } = options;

  return new Promise<File>((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          // If image is already smaller than maxDimension and under 150KB, keep original
          if (width <= maxDimension && height <= maxDimension && file.size < 150 * 1024) {
            resolve(file);
            return;
          }

          // Calculate scaled dimensions
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                // If webp conversion failed, fallback to jpeg
                canvas.toBlob(
                  (jpegBlob) => {
                    if (!jpegBlob || jpegBlob.size >= file.size) {
                      resolve(file);
                      return;
                    }
                    const newFileName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
                    const compressedFile = new File([jpegBlob], newFileName, {
                      type: 'image/jpeg',
                      lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                  },
                  'image/jpeg',
                  quality
                );
                return;
              }

              if (blob.size >= file.size) {
                resolve(file);
                return;
              }

              const ext = targetFormat === 'image/webp' ? '.webp' : '.jpg';
              const newFileName = file.name.replace(/\.[^/.]+$/, '') + ext;
              const compressedFile = new File([blob], newFileName, {
                type: targetFormat,
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            },
            targetFormat,
            quality
          );
        } catch (err) {
          console.error('Image compression error, using original:', err);
          resolve(file);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export async function compressImageFiles(
  files: File[],
  options: CompressionOptions = {}
): Promise<File[]> {
  const compressed: File[] = [];
  for (const f of files) {
    try {
      const res = await compressImageFile(f, options);
      compressed.push(res);
    } catch {
      compressed.push(f);
    }
  }
  return compressed;
}
