// Downscale photos in the browser before upload (max 1600 px, JPEG 0.82): saves storage on the free plan.
export async function compressImage(file: File, max = 1600, quality = 0.82): Promise<File> {
  if (!/^image\/(jpeg|png|webp|bmp)$/i.test(file.type) || file.size < 350 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
