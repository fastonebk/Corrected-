/* ---------- Auto-crop heuristic (ID-photo framing) ---------- */

function autoCropBox(naturalW, naturalH, face) {
  let box;

  if (face && face.eyeMid && face.iod) {
    // 1. Calculate width based purely on eye distance (Most stable for ID cards)
    const headWidthApprox = face.iod * 2.5; 
    const HEAD_WIDTH_RATIO = 0.41; // Perfect balance: not too tight, not too loose
    let cropW = headWidthApprox / HEAD_WIDTH_RATIO;
    let cropH = cropW / ASPECT;

    // 2. Set eye-line to 44% down to ensure hair/head isn't cut off at the top
    const EYE_LINE_RATIO = 0.44; 
    let cropX = face.eyeMid.x - cropW / 2;
    let cropY = face.eyeMid.y - cropH * EYE_LINE_RATIO;

    box = { x: cropX, y: cropY, w: cropW, h: cropH };
  } else if (face && face.box && face.box.w > 0 && face.box.h > 0) {
    // Fallback calculation if landmarks fail slightly
    const faceBox = face.box;
    const headW = faceBox.w * 1.6;
    const cropW = headW / 0.45;
    const cropH = cropW / ASPECT;

    const cropX = (faceBox.x + faceBox.w / 2) - cropW / 2;
    const cropY = faceBox.y - cropH * 0.20;

    box = { x: cropX, y: cropY, w: cropW, h: cropH };
  } else {
    // Default center fallback
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
      y: Math.max(0, (naturalH - cropH) * 0.1),
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