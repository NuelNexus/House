// Real Snapchat-style overlay filters for the camera, ported from the
// `snapchat-filters-opencv` sprites (hat, glasses, mustache, doggy,
// rainbow, animated flies). Each overlay is a set of PNG sprites placed
// relative to the detected face box, so the same placement math drives
// the live preview, photo capture and video recording.
// `?url` matters: plain PNG imports get Vite's `?import` rewrite in dev,
// which makes the dev server return a JS wrapper instead of the image —
// Image() loads then fail and no overlay ever shows. `?url` guarantees
// the real file URL in both dev and build.
import hatUrl from "../assets/filters/hat.png?url";
import glassesUrl from "../assets/filters/glasses.png?url";
import mustacheUrl from "../assets/filters/mustache.png?url";
import doggyEarsUrl from "../assets/filters/doggy_ears.png?url";
import doggyNoseUrl from "../assets/filters/doggy_nose.png?url";
import doggyTongueUrl from "../assets/filters/doggy_tongue.png?url";
import rainbowUrl from "../assets/filters/rainbow.png?url";
import fly0Url from "../assets/filters/fly_0.png?url";
import fly1Url from "../assets/filters/fly_1.png?url";
import fly2Url from "../assets/filters/fly_2.png?url";
import fly3Url from "../assets/filters/fly_3.png?url";

// Where each sprite sits relative to the face box, as fractions of the
// face box's width (w) and height (hx/hy anchors). `pin` decides which
// edge of the sprite is anchored: "bottom" pins the sprite's bottom edge
// at the anchor, "top" pins its top edge, "center" centers it.
const SPRITE_DEFS = {
  hat:       { src: hatUrl,       w: 1.06, hx: 0.5,  hy: 0.02, pin: "bottom" },
  glasses:   { src: glassesUrl,   w: 1.08, hx: 0.5,  hy: 0.34, pin: "center" },
  mustache:  { src: mustacheUrl,  w: 0.52, hx: 0.5,  hy: 0.62, pin: "center" },
  dogEar:    { src: doggyEarsUrl, w: 1.0,  hx: 0.5,  hy: 0.0,  pin: "bottom" },
  dogNose:   { src: doggyNoseUrl, w: 0.3,  hx: 0.5,  hy: 0.55, pin: "center" },
  dogTongue: { src: doggyTongueUrl, w: 0.34, hx: 0.5, hy: 0.7, pin: "top" },
  rainbow:   { src: rainbowUrl,   w: 0.36, hx: 0.5,  hy: 0.66, pin: "top" },
  fly:       { src: fly0Url,      w: 0.28, hx: 0.82, hy: 0.12, pin: "center", bob: true },
};

// The filter rail: "original" is the plain camera, everything else is a
// sprite overlay. `sprites` lists the SPRITE_DEFS keys to draw; `frames`
// is optional (the animated flies).
export const OVERLAYS = [
  { id: "original", label: "Original", sprites: [] },
  { id: "hat",      label: "Hat",      sprites: ["hat"], thumb: hatUrl },
  { id: "glasses",  label: "Glasses",  sprites: ["glasses"], thumb: glassesUrl },
  { id: "mustache", label: "Mustache", sprites: ["mustache"], thumb: mustacheUrl },
  { id: "doggy",    label: "Doggy",    sprites: ["dogEar", "dogNose", "dogTongue"], thumb: doggyEarsUrl },
  { id: "rainbow",  label: "Rainbow",  sprites: ["rainbow"], thumb: rainbowUrl },
  { id: "flies",    label: "Flies",    sprites: ["fly"], frames: [fly0Url, fly1Url, fly2Url, fly3Url], thumb: fly0Url },
];

export const DEFAULT_OVERLAY = OVERLAYS[0];

// Load every sprite URL into an <img> so both the DOM preview and the
// canvas bakes can draw them. Resolves when each image either loads or
// fails (a missing sprite simply never renders).
const imageCache = new Map(); // url -> HTMLImageElement

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const cached = imageCache.get(url);
    if (cached) return resolve(cached);
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function loadSpriteImages() {
  const urls = new Set();
  for (const key of Object.keys(SPRITE_DEFS)) urls.add(SPRITE_DEFS[key].src);
  for (const o of OVERLAYS) (o.frames || []).forEach((u) => urls.add(u));
  return Promise.all([...urls].map(loadImage));
}

// The <img> for one sprite of an overlay — the fly cycles through its
// animation frames, everything else is the static sprite.
export function getOverlayImage(overlay, key, t = 0) {
  const url = overlay.frames
    ? overlay.frames[Math.floor(t / 130) % overlay.frames.length]
    : SPRITE_DEFS[key].src;
  return imageCache.get(url) || null;
}

// Rect for one sprite placement, in the SAME pixel space as the face box
// (the video's intrinsic frame). Bobbing sprites (flies) drift a little
// around their anchor over time.
export function computeSpriteRect(def, face, aspect, t = 0) {
  let ax = face.x + def.hx * face.w;
  let ay = face.y + def.hy * face.h;
  if (def.bob) {
    ax += Math.sin(t / 320) * 0.07 * face.w;
    ay += Math.cos(t / 430) * 0.06 * face.w;
  }
  const w = def.w * face.w;
  const h = w * aspect;
  let left = ax - w / 2;
  let top;
  if (def.pin === "bottom") top = ay - h;
  else if (def.pin === "top") top = ay;
  else top = ay - h / 2;
  return { left, top, w, h };
}

// One sprite's <img> + its rect in the face box's pixel space, for the
// current moment — used by the live preview to position DOM sprites
// (canvas bakes use drawOverlays instead).
export function overlaySpriteRect(overlay, key, face, t = 0) {
  const def = SPRITE_DEFS[key];
  if (!def) return null;
  const img = getOverlayImage(overlay, key, t);
  if (!img || !img.complete || !img.naturalWidth) return null;
  const aspect = img.naturalHeight / img.naturalWidth;
  return { src: img.src, rect: computeSpriteRect(def, face, aspect, t) };
}

// Draw an overlay onto a canvas whose size equals the video's intrinsic
// frame (so `face` maps 1:1). Called for both photo capture and the
// video-recording bake canvas.
export function drawOverlays(ctx, overlay, face, t = 0) {
  if (!overlay || overlay.id === "original" || !face || !face.w || !face.h) return;
  for (const key of overlay.sprites) {
    const def = SPRITE_DEFS[key];
    const img = getOverlayImage(overlay, key, t);
    if (!img || !img.complete || !img.naturalWidth) continue;
    const aspect = img.naturalHeight / img.naturalWidth;
    const rect = computeSpriteRect(def, face, aspect, t);
    ctx.drawImage(img, rect.left, rect.top, rect.w, rect.h);
  }
}

// Map a rect from the video's intrinsic pixel space onto a display box
// (the camera stage) that shows the video with object-fit: cover.
export function mapIntrinsicToStage(rect, vw, vh, sw, sh) {
  if (!vw || !vh || !sw || !sh) return null;
  const scale = Math.max(sw / vw, sh / vh);
  const offX = (sw - vw * scale) / 2;
  const offY = (sh - vh * scale) / 2;
  return {
    left: rect.left * scale + offX,
    top: rect.top * scale + offY,
    w: rect.w * scale,
    h: rect.h * scale,
  };
}

// -------------------------------------------------------------------
// Face tracking. Tries, in order:
//   1. MediaPipe FaceLandmarker (WASM, works in every modern browser) —
//      gives real 468-landmark tracking so overlays stick to the face.
//   2. The native FaceDetector (Shape Detection API) on Chrome/Android.
//   3. A static centred box (selfie assumption) while MediaPipe loads or
//      if neither tracker is available, so overlays always show up.
// The reported face box is in the video's intrinsic pixels.
// -------------------------------------------------------------------

// MediaPipe is lazy-loaded (dynamic import) so the app bundle doesn't
// grow; the WASM + model come from CDNs, matching the fonts/FontAwesome
// setup already used by the site.
const MP_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MP_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function createFaceTracker() {
  // mode: "loading" (MediaPipe still initialising) | "mediapipe" |
  //       "facedetector" | "fallback"
  let mode = "loading";
  let landmarker = null;
  let lastTs = 0;
  const Detector =
    typeof window !== "undefined" &&
    (window.FaceDetector || window.webkitFaceDetector);
  let detector = null;
  if (Detector) {
    try {
      detector = new Detector({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      detector = null; // API present but unusable here
    }
  }
  let mpInit = null;
  let timer = null;
  let lastFace = null;
  let cb = null;
  let started = false;

  // Load the MediaPipe WASM + model once; GPU first, CPU on failure.
  const initMediaPipe = () => {
    if (!mpInit) {
      mpInit = (async () => {
        try {
          const { FaceLandmarker, FilesetResolver } = await import(
            "@mediapipe/tasks-vision"
          );
          const vision = await FilesetResolver.forVisionTasks(MP_WASM_URL);
          try {
            landmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: MP_MODEL_URL, delegate: "GPU" },
              runningMode: "VIDEO",
              numFaces: 1,
            });
          } catch {
            landmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: MP_MODEL_URL, delegate: "CPU" },
              runningMode: "VIDEO",
              numFaces: 1,
            });
          }
          mode = "mediapipe";
        } catch {
          mode = detector ? "facedetector" : "fallback";
        }
      })();
    }
    return mpInit;
  };

  const fallbackBox = (vw, vh) => {
    // A centred selfie-sized box that always fits inside the frame
    // (on a landscape webcam a face-width of 52% of the width would be
    // taller than the frame itself and push sprites off-screen).
    const w = Math.min(vw * 0.52, vh * 0.4);
    const h = w * 1.28;
    const y = Math.min(vh * 0.15, Math.max(0, vh - h - vh * 0.08));
    return { x: (vw - w) / 2, y, w, h };
  };

  // MediaPipe landmarks are normalized 0..1 — turn the full face oval
  // into a pixel-space box matching the FaceDetector output.
  const boxFromLandmarks = (pts, vw, vh) => {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX * vw,
      y: minY * vh,
      w: (maxX - minX) * vw,
      h: (maxY - minY) * vh,
    };
  };

  return {
    get tracking() {
      return mode === "mediapipe" || mode === "facedetector";
    },
    start(videoEl, onFace) {
      if (started) return;
      started = true;
      cb = onFace;
      initMediaPipe(); // fire and forget — the tick uses the fallback meanwhile
      const tick = async () => {
        if (!started) return;
        const v = videoEl;
        if (!v || !v.videoWidth || v.readyState < 2) {
          timer = setTimeout(tick, 250);
          return;
        }
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        if (mode === "mediapipe" && landmarker) {
          try {
            const ts = Math.max(performance.now(), lastTs + 1);
            lastTs = ts;
            const res = landmarker.detectForVideo(v, ts);
            if (res && res.faceLandmarks && res.faceLandmarks.length) {
              lastFace = boxFromLandmarks(res.faceLandmarks[0], vw, vh);
            } else {
              lastFace = null;
            }
            if (cb) cb(lastFace);
          } catch {
            /* keep the last known face */
          }
          timer = setTimeout(tick, 100); // ~10fps — smooth, light on the GPU
          return;
        }
        if (detector) {
          try {
            const faces = await detector.detect(v);
            if (faces && faces.length) {
              const f = faces[0].boundingBox;
              lastFace = { x: f.x, y: f.y, w: f.width, h: f.height };
            } else {
              lastFace = null;
            }
            if (cb) cb(lastFace);
          } catch {
            /* detection hiccup — keep the last known face */
          }
          timer = setTimeout(tick, 100);
          return;
        }
        const fb = fallbackBox(vw, vh);
        lastFace = fb;
        if (cb) cb(fb);
        timer = setTimeout(tick, 250);
      };
      tick();
    },
    stop() {
      started = false;
      window.clearTimeout(timer);
      timer = null;
      cb = null;
    },
    get face() {
      return lastFace;
    },
  };
}
