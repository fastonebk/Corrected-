/* Imaging utilities used by app.js */

const TARGET_W = 300; // 1 in  @ 300 dpi
const TARGET_H = 378; // 1.26 in @ 300 dpi
const ASPECT = TARGET_W / TARGET_H;
const DPI = 300;

/* ---------- Face detection ---------- */

const DETECTOR_INPUT_SIZE = 320;

let faceApiReady = false;
let faceApiFailed = false;
let landmarksReady = false;

async function loadFaceModels() {
  const CDN_ROOTS = [
    "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
    "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights",
  ];
  if (typeof faceapi === "undefined") {
    faceApiFailed = true;
    return false;
  }
  for (const root of CDN_ROOTS) {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(root);
      faceApiReady = true;
      try {
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri(root);
        landmarksReady = true;
      } catch (err) {
        landmarksReady = false;
      }
      return true;
    } catch (err) {
      // try next CDN root
    }
  }
  faceApiFailed = true;
  return false;
}

function avgPoint(points) {
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
}

async function detectFace(imgEl) {
  if (!faceApiReady) return null;
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: DETECTOR_INPUT_SIZE,
    scoreThreshold: 0.4,
  });

  if (landmarksReady) {
    try {
      const result = await faceapi.detectSingleFace(imgEl, options).withFaceLandmarks(true);
      if (result) {
        const b = result.detection.box;
        const leftEye = avgPoint(result.landmarks.getLeftEye());
        const rightEye = avgPoint(result.landmarks.getRightEye());
        return {
          box: { x: b.x, y: b.y, w: b.width, h: b.height },
          eyeMid: { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 },
          iod: Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y),
        };
      }
      return null;
    } catch (err) {
      // fall through to box-only detection below
    }
  }

  try {
    const result = await faceapi.detectSingleFace(imgEl, options);
    if (!result) return null;
    const b = result.box;
    return { box: { x: b.x, y: b.y, w: b.width, h: b.height }, eyeMid: null, iod: null };
  } catch (err) {
    return null;
  }
}

/* ---------- Auto-crop heuristic (ID-photo framing) ---------- */

function autoCropBox(naturalW, naturalH, face) {
  let box;

  if (face && face.eyeMid && face.iod && face.iod > 15) {
    // 1. Give more breathing room (lower head-width ratio = wider frame)
    const headWidthApprox = face.iod * 2.5;
    const HEAD_WIDTH_RATIO = 0.38; 
    let cropW = headWidthApprox / HEAD_WIDTH_RATIO;
    let cropH = cropW / ASPECT;

    // 2. Ensure crop is large enough compared to face bounding box
    if (face.box) {
      const minH = face.box.h * 2.3;
      if (cropH < minH) {
        cropH = minH;
        cropW = cropH * ASPECT;
      }
    }

    // 3. Lower the eye line (~46% down) so head tops & hair stay inside the frame
    const EYE_LINE_RATIO = 0.46;
    let cropX = face.eyeMid.x - cropW / 2;
    let cropY = face.eyeMid.y - cropH * EYE_LINE_RATIO;

    box = { x: cropX, y: cropY, w: cropW, h: cropH };
  } else if (face && face.box && face.box.w > 0 && face.box.h > 0) {
    // Fallback: Box-only calculation
    const faceBox = face.box;
    const headH = faceBox.h * 2.2;
    const cropH = headH / 0.65;
    const cropW = cropH * ASPECT;

    const cropX = (faceBox.x + faceBox.w / 2) - cropW / 2;
    const cropY = faceBox.y - cropH * 0.22;

    box = { x: cropX, y: cropY, w: cropW, h: cropH };
  } else {
    // No face found: standard center-top crop
    let cropW, cropH;
    if (naturalW / naturalH > ASPECT) {
      cropH = naturalH;
      cropW = cropH * ASPECT;
    } else {
      cropW = naturalW;
      cropH = cropW / ASPECT;
    }
    box = {
      x: (naturalW - cropW) / 2,
      y: Math.max(0, (naturalH - cropH) * 0.15),
      w: cropW,
      h: cropH,
    };
  }

  return clampBox(box, naturalW, naturalH);
}

function clampBox(box, naturalW, naturalH) {
  let { x, y, w, h } = box;

  if (w > naturalW) {
    w = naturalW;
    h = w / ASPECT;
  }
  if (h > naturalH) {
    h = naturalH;
    w = h * ASPECT;
  }

  x = Math.max(0, Math.min(x, naturalW - w));
  y = Math.max(0, Math.min(y, naturalH - h));

  return { x, y, w, h };
}

/* ---------- High quality crop + resize ---------- */

function cropAndResize(imgEl, box, targetW, targetH) {
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = Math.max(1, Math.round(box.w));
  cropCanvas.height = Math.max(1, Math.round(box.h));
  const cctx = cropCanvas.getContext("2d");
  cctx.imageSmoothingEnabled = true;
  cctx.imageSmoothingQuality = "high";
  cctx.drawImage(
    imgEl,
    box.x, box.y, box.w, box.h,
    0, 0, cropCanvas.width, cropCanvas.height
  );

  let src = cropCanvas;
  let curW = src.width;
  let curH = src.height;

  while (curW / 2 > targetW && curH / 2 > targetH) {
    const stepW = Math.round(curW / 2);
    const stepH = Math.round(curH / 2);
    const stepCanvas = document.createElement("canvas");
    stepCanvas.width = stepW;
    stepCanvas.height = stepH;
    const sctx = stepCanvas.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(src, 0, 0, stepW, stepH);
    src = stepCanvas;
    curW = stepW;
    curH = stepH;
  }

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = targetW;
  finalCanvas.height = targetH;
  const fctx = finalCanvas.getContext("2d");
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = "high";
  fctx.drawImage(src, 0, 0, targetW, targetH);
  return finalCanvas;
}

/* ---------- Sharpen (unsharp-mask style 3x3 convolution) ---------- */

function sharpenCanvas(canvas, amount = 1) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data, d = out.data;

  const center = 1 + 4 * amount;
  const edge = -amount;
  const kernel = [0, edge, 0, edge, center, edge, 0, edge, 0];

  const at = (x, y, c) => s[(y * w + x) * 4 + c];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
          d[idx + c] = at(x, y, c);
          continue;
        }
        let sum = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += at(x + kx, y + ky, c) * kernel[k++];
          }
        }
        d[idx + c] = Math.max(0, Math.min(255, sum));
      }
      d[idx + 3] = s[idx + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/* ---------- DPI metadata injection ---------- */

const CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngWithDpi(arrayBuffer, dpi) {
  const bytes = new Uint8Array(arrayBuffer);
  const pxPerMeter = Math.round(dpi / 0.0254);

  const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]); // "pHYs"
  const data = new Uint8Array(9);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, pxPerMeter); 
  dv.setUint32(4, pxPerMeter); 
  data[8] = 1; 

  const typeAndData = new Uint8Array(type.length + data.length);
  typeAndData.set(type, 0);
  typeAndData.set(data, type.length);
  const crc = crc32(typeAndData);

  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const cdv = new DataView(chunk.buffer);
  cdv.setUint32(0, data.length); 
  chunk.set(type, 4);
  chunk.set(data, 8);
  cdv.setUint32(8 + data.length, crc);

  const insertAt = 8 + 25;

  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(bytes.subarray(insertAt), insertAt + chunk.length);
  return out;
}

function jpegWithDpi(arrayBuffer, dpi) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes; 

  const hasJfif =
    bytes[2] === 0xff &&
    bytes[3] === 0xe0 &&
    bytes[6] === 0x4a && // J
    bytes[7] === 0x46 && // F
    bytes[8] === 0x49 && // I
    bytes[9] === 0x46; // F

  if (hasJfif) {
    const out = new Uint8Array(bytes);
    const dv = new DataView(out.buffer);
    out[13] = 1; 
    dv.setUint16(14, dpi);
    dv.setUint16(16, dpi);
    return out;
  }

  const app0 = new Uint8Array(18);
  const dv = new DataView(app0.buffer);
  dv.setUint16(0, 0xffe0);
  dv.setUint16(2, 16); 
  app0.set([0x4a, 0x46, 0x49, 0x46, 0x00], 4); 
  app0[9] = 1; 
  app0[10] = 1; 
  app0[11] = 1; 
  dv.setUint16(12, dpi);
  dv.setUint16(14, dpi);
  app0[16] = 0; 
  app0[17] = 0; 

  const out = new Uint8Array(bytes.length + app0.length);
  out.set(bytes.subarray(0, 2), 0);
  out.set(app0, 2);
  out.set(bytes.subarray(2), 2 + app0.length);
  return out;
}

function canvasToBlobWithDpi(canvas, mimeType, dpi) {
  return new Promise((resolve) => {
    canvas.toBlob(
      async (blob) => {
        const buf = await blob.arrayBuffer();
        let patched;
        if (mimeType === "image/png") {
          patched = pngWithDpi(buf, dpi);
        } else if (mimeType === "image/jpeg") {
          patched = jpegWithDpi(buf, dpi);
        } else {
          patched = new Uint8Array(buf);
        }
        resolve(new Blob([patched], { type: mimeType }));
      },
      mimeType,
      0.95
    );
  });
}