// ============================================================
// Photos: the shape rule, and shrinking before upload
// ============================================================
// Every photo slot on the site is a square that shows the whole photo, with
// paper-coloured bands for whatever is left over (see the image styles in
// App.jsx). Uploads are kept between 4:5 and 5:4 so those bands stay thin;
// anything outside that goes through the crop box on the submit page.
//
// Phone photos arrive at 3–6 MB, and every screen and every push notification
// downloads the full file from Supabase Storage — 50 phones opening one photo
// story was ~250 MB of egress. A 1600px JPEG looks the same on all of them and
// is a few hundred KB.

export const MIN_RATIO = 4 / 5;  // width / height: no taller than 4:5
export const MAX_RATIO = 5 / 4;  // no wider than 5:4
const MAX_EDGE = 1600;
const QUALITY = 0.82;

// The nearest allowed shape, which is what the crop box opens at: keeps as
// much of the photo as the rule allows.
export function clampRatio(ratio) {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

export function needsCrop(width, height) {
  const r = width / height;
  return r < MIN_RATIO - 0.005 || r > MAX_RATIO + 0.005;
}

// Decodes the photo, upright (phones store sideways photos plus an EXIF
// rotation). Throws for anything the browser cannot read — notably HEIC on
// anything but Safari — which is also a photo the wall screens could not show.
export async function readPhoto(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

// Crops to `rect` (pixels of the upright photo; the whole photo if omitted)
// and shrinks to MAX_EDGE on the long side. Always returns a JPEG File.
export async function renderPhoto(bitmap, rect, name = "photo") {
  const { x, y, width, height } = rect || { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const dw = Math.max(1, Math.round(width * scale));
  const dh = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  // JPEG has no transparency; a PNG's clear areas would otherwise turn black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, dw, dh);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, x, y, width, height, 0, 0, dw, dh);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Could not encode photo");
  return new File([blob], name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" });
}
