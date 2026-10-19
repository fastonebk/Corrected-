# ID Snap — ID Photo Cropper

A small static website that crops uploaded photos to **1 in × 1.26 in at 300 DPI**
(exactly **300 × 378 pixels**), centers the crop on the detected face, and lets
you export one photo or a whole batch as a `.zip`. It can also remove or
swap the background for a flat color.

Everything runs in the browser. No backend, no upload to any server, no AI
API — it's plain HTML/CSS/JS plus three CDN-loaded model libraries (face
detection, background segmentation, and zipping).

## Files

```
index.html      the page structure
styles.css      all styling (design tokens at the top of the file)
cropper.js      the draggable/resizable crop-box component
imaging.js      crop/resize/sharpen + DPI-metadata writing + the auto-crop heuristic
segmentation.js background removal (MediaPipe Selfie Segmentation)
app.js          wires the UI together (single-photo editor + bulk workflow)
```

## Run it locally

```bash
cd photocrop
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy on GitHub Pages

1. Push these files to the root of the branch you'll publish (usually `main`):

   ```bash
   git init
   git add .
   git commit -m "ID photo cropper"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Build and deployment → Source** = "Deploy
   from a branch", **Branch** = `main` / `/(root)`. Save.

3. GitHub gives you a URL like `https://<your-username>.github.io/<your-repo>/`
   within a minute or two. No build step, no `npm install` — static files.

## How the auto-crop works

1. [face-api.js](https://github.com/justadudewhohacks/face-api.js) (loaded
   from a CDN) runs its "tiny face detector" plus a lightweight 68-point
   landmark model on the uploaded image, right in the browser.
2. The frame is centered and sized off the **eyes**, not the raw detector
   box: eye position and the distance between the eyes barely move
   regardless of hairstyle, fringe, tikka/accessories, or head tilt, so this
   stays far more consistent across a whole batch than sizing off the
   detector's bounding box would. Eyes land ~42% down from the top of the
   frame, with head width set relative to the eye spacing — the same
   convention passport/ID photo software uses.
3. If the landmark model doesn't load, it falls back to a heuristic based
   on the raw detector box; if no face is found at all, it falls back to a
   centered crop.
4. You can drag the frame to move it, or drag a corner to resize it — the
   shape always stays locked to the correct ratio. The tool is fully usable
   by hand at every fallback level; auto-detection is a head start, not a
   requirement.

## Background removal

Uses [MediaPipe Selfie Segmentation](https://github.com/google/mediapipe),
loaded from a CDN the same way the face model is — it separates the person
from the background entirely client-side, no photo ever leaves the browser.

In both the single and bulk editors, the **Background** dropdown offers:
- **Keep original** — no change (default)
- **Remove — transparent** — exports a PNG with an alpha channel (pick PNG
  as the format for this one; JPG has no transparency)
- **Remove — white / blue** — fills the background with a flat color
- **Remove — custom color…** — pick any color

Segmentation runs on the already-cropped 300×378 canvas, after the crop and
sharpen steps, so what you see in the preview is exactly what gets
exported. It's deliberately **not instant while dragging the crop frame** —
previews are debounced (settle ~300ms after you stop moving the frame) so
dragging stays smooth; the slightly-slower, higher-quality pass just runs
once you stop. Bulk downloads process one photo at a time through
segmentation (the library isn't safe to run concurrently), so a big batch
with background removal on will take noticeably longer than crop-only — the
download button shows live progress (`Processing x/y…`) so it's clear it's
working, not stuck.

## Output quality

* Downscaling is done in halving steps (rather than one big resize) for a
  cleaner result, and a light sharpen pass (toggleable) keeps facial detail
  crisp at the small final size.
* The exported PNG/JPG has real **300 DPI** metadata written into the file
  (a `pHYs` chunk for PNG, a JFIF density header for JPG) — so image
  viewers, printers, and photo-ID software that read resolution metadata
  will report 300 DPI, not just "300×378 pixels".

## Bulk-mode performance

Face detection is processed **4 photos at a time** (not all at once, and
not strictly one by one) — keeps memory sane on large batches while running
close to as fast as the browser allows. A "Detecting faces… x/y" counter
shows progress. The detector's input size is tuned to 320px
(`DETECTOR_INPUT_SIZE` in `imaging.js`) for a speed/accuracy balance on
headshot-style photos.

Background removal, when enabled, is the slow part — budget noticeably more
time for a bulk `.zip` with it on than with it off.

## A note on the CDN dependencies

`index.html` loads three libraries from jsDelivr at runtime: `face-api.js`
(face detection), `@mediapipe/selfie_segmentation` (background removal),
and `jszip` (bulk `.zip` downloads). If your network blocks jsDelivr, those
three features won't work, but single-photo manual cropping still will —
everything except those is plain vanilla JS. Each model has its own status
line under the upload box telling you whether it loaded.

## Customizing

* **Target size**: change `TARGET_W` / `TARGET_H` / `DPI` at the top of
  `imaging.js`.
* **Framing**: the heuristic constants (head size ratio, eye-line position)
  are in `autoCropBox()` in `imaging.js`.
* **Background colors offered**: edit the `<option>` list for `#bg-select`
  and `#bulk-bg-select` in `index.html`.
* **Look and feel**: all colors, fonts, and spacing are CSS custom
  properties at the top of `styles.css`.
