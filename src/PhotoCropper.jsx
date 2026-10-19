// ============================================================
// The crop box on the submit page
// ============================================================
// Full screen, so it is usable on a phone at a party: drag to move, pinch (or
// the slider, or a mouse wheel) to zoom. Three shapes, all inside the 4:5–5:4
// rule in lib/photo.js; it opens at the one nearest the photo, centred, so
// most people can just tap "Use photo".

import { useState } from "react";
import Cropper from "react-easy-crop";

const SHAPES = [
  { label: "Tall", aspect: 4 / 5 },
  { label: "Square", aspect: 1 },
  { label: "Wide", aspect: 5 / 4 },
];

export const cropperStyles = `
  .cropper-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: #1a1008;
    display: flex;
    flex-direction: column;
  }

  .cropper-title {
    color: var(--paper);
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 15px;
    letter-spacing: 3px;
    text-transform: uppercase;
    text-align: center;
    padding: 14px 16px 10px;
  }

  .cropper-area {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .cropper-controls {
    padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 520px;
    width: 100%;
    margin: 0 auto;
  }

  .cropper-shapes { display: flex; gap: 8px; }

  .cropper-shape {
    flex: 1;
    background: none;
    border: 1px solid var(--paper-darker);
    color: var(--paper);
    padding: 8px;
    font-family: 'IM Fell English', serif;
    font-size: 14px;
    cursor: pointer;
  }

  .cropper-shape.active { background: var(--paper); color: var(--ink); }

  .cropper-zoom { width: 100%; accent-color: var(--gold); }

  .cropper-actions { display: flex; gap: 8px; }

  .cropper-actions button {
    flex: 1;
    padding: 12px;
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 2px;
    text-transform: uppercase;
    cursor: pointer;
    border: 1px solid var(--paper);
  }

  .cropper-cancel { background: none; color: var(--paper); }
  .cropper-done { background: var(--paper); color: var(--ink); }
`;

export default function PhotoCropper({ src, initialAspect, onCancel, onDone }) {
  const nearest = SHAPES.reduce((a, b) =>
    Math.abs(b.aspect - initialAspect) < Math.abs(a.aspect - initialAspect) ? b : a);
  const [aspect, setAspect] = useState(nearest.aspect);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);

  return (
    <div className="cropper-overlay" role="dialog" aria-label="Crop your photo">
      <div className="cropper-title">Frame your photo</div>
      <div className="cropper-area">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          maxZoom={4}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
        />
      </div>
      <div className="cropper-controls">
        <div className="cropper-shapes">
          {SHAPES.map(s => (
            <button
              key={s.label}
              type="button"
              className={`cropper-shape ${aspect === s.aspect ? "active" : ""}`}
              onClick={() => setAspect(s.aspect)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          className="cropper-zoom"
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          aria-label="Zoom"
        />
        <div className="cropper-actions">
          <button type="button" className="cropper-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="cropper-done" disabled={!area} onClick={() => onDone(area)}>
            Use photo
          </button>
        </div>
      </div>
    </div>
  );
}
