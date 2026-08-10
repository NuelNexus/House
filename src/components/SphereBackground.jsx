import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { POSITIONS, RADII } from "../data/sphereData";

// Party-balloon palette — one bright colour per balloon.
const BALLOON_COLORS = [
  "#ff4d6d", // red
  "#ff9f45", // orange
  "#ffd93d", // yellow
  "#6bcf7f", // green
  "#4dd0c1", // teal
  "#4da3ff", // blue
  "#9b7bff", // purple
  "#ff7ab8", // pink
  "#ff6b6b", // coral
  "#ffb703", // amber
];

// The app's hype is the blue flame — reuse the exact Font Awesome fire glyph
// (the same icon as the hype feed's like button) for the floating hypes.
const FIRE_GLYPH = "\uf06d";
const FA_FONT = '900 110px "Font Awesome 6 Free"';

/**
 * Draws the blue fire (hype) icon onto a canvas texture. Uses the real Font
 * Awesome glyph when the webfont is loaded, and falls back to a hand-drawn
 * teardrop flame while it loads (or if it never does).
 */
function makeFlameTexture(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2;

  const useGlyph =
    typeof document !== "undefined" &&
    document.fonts &&
    document.fonts.check(FA_FONT, FIRE_GLYPH);

  if (useGlyph) {
    const grad = ctx.createLinearGradient(0, size * 0.12, 0, size * 0.92);
    grad.addColorStop(0, "#93c5fd");
    grad.addColorStop(0.5, "#3b82f6");
    grad.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = grad;
    ctx.font = FA_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(FIRE_GLYPH, cx, size * 0.54);
    return canvas;
  }

  // Fallback flame — teardrop with two bottom lobes and a pointed tip.
  const outer = ctx.createLinearGradient(0, size * 0.12, 0, size * 0.92);
  outer.addColorStop(0, "#93c5fd");
  outer.addColorStop(0.5, "#3b82f6");
  outer.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.moveTo(cx, 12);
  ctx.bezierCurveTo(cx + 42, 44, cx + 40, 90, cx + 28, 104);
  ctx.bezierCurveTo(cx + 36, 114, cx + 22, 120, cx + 12, 112);
  ctx.bezierCurveTo(cx + 16, 106, cx + 4, 118, cx - 4, 110);
  ctx.bezierCurveTo(cx - 8, 120, cx - 22, 112, cx - 28, 108);
  ctx.bezierCurveTo(cx - 40, 90, cx - 42, 46, cx, 12);
  ctx.closePath();
  ctx.fill();

  const inner = ctx.createLinearGradient(0, size * 0.4, 0, size * 0.82);
  inner.addColorStop(0, "#eff6ff");
  inner.addColorStop(1, "#bfdbfe");
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.moveTo(cx, 42);
  ctx.bezierCurveTo(cx + 20, 58, cx + 18, 82, cx + 10, 92);
  ctx.bezierCurveTo(cx + 14, 98, cx + 6, 100, cx + 2, 96);
  ctx.bezierCurveTo(cx + 4, 92, cx - 4, 96, cx - 6, 94);
  ctx.bezierCurveTo(cx - 12, 88, cx - 14, 62, cx, 42);
  ctx.closePath();
  ctx.fill();

  return canvas;
}

export default function SphereBackground({ onReady }) {
  const canvasRef = useRef(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // WebGL can be unavailable (headless browsers, some laptops with the GPU
    // disabled, remote desktops). THREE throws deep inside WebGLRenderer when
    // the context comes back null — fall back to a static gradient and let the
    // intro finish normally.
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      if (!renderer.getContext()) throw new Error("webgl context is null");
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch (err) {
      onReadyRef.current?.();
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      25,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 24;

    // ---- Balloons & floating hypes ----
    const balloonRoot = new THREE.Group();
    scene.add(balloonRoot);

    const balloons = []; // { group, ball, radius, originalPosition }
    const flameSprites = [];
    const disposables = []; // materials & textures to free on unmount

    const sphereGeometry = new THREE.SphereGeometry(1, 48, 48);
    const stringGeometry = new THREE.CylinderGeometry(0.014, 0.014, 1.25, 5);
    const knotGeometry = new THREE.SphereGeometry(0.06, 12, 12);
    const stringMaterial = new THREE.MeshBasicMaterial({ color: "#8f96ad" });
    disposables.push(stringMaterial);

    POSITIONS.forEach((pos, index) => {
      const radius = RADII[index] ?? 0.4;

      // Every 4th spot is a floating hype flame; the rest are balloons.
      if (index % 4 === 3) {
        const texture = new THREE.CanvasTexture(makeFlameTexture(128));
        texture.colorSpace = THREE.SRGBColorSpace;
        disposables.push(texture);

        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          opacity: 0.95,
        });
        disposables.push(material);

        const sprite = new THREE.Sprite(material);
        const scale = 0.75 + radius * 1.25;
        sprite.scale.set(scale, scale, 1);
        const baseY = pos.y + 0.75;
        sprite.position.set(pos.x, baseY, pos.z);
        sprite.userData = {
          baseY,
          offset: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.06,
        };
        flameSprites.push(sprite);
        scene.add(sprite);
        return;
      }

      // Colourful glossy balloon: stretched sphere + string + knot.
      const color = BALLOON_COLORS[index % BALLOON_COLORS.length];
      const material = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.14,
        roughness: 0.3,
        emissive: color,
        emissiveIntensity: 0.16,
      });
      disposables.push(material);

      const ball = new THREE.Mesh(sphereGeometry, material);
      const sy = radius * 1.16; // balloon-ish vertical stretch
      const sxz = radius * 0.94;
      ball.scale.set(sxz, sy, sxz);
      ball.castShadow = true;
      ball.receiveShadow = true;

      const string = new THREE.Mesh(stringGeometry, stringMaterial);
      string.position.y = -sy - 0.6;
      const knot = new THREE.Mesh(knotGeometry, stringMaterial);
      knot.position.y = -sy - 0.08;

      const g = new THREE.Group();
      g.position.set(pos.x, pos.y, pos.z);
      g.add(ball, string, knot);

      balloons.push({ group: g, ball, radius, originalPosition: { ...pos } });
      balloonRoot.add(g);
    });

    const ballMeshes = balloons.map((b) => b.ball);

    // Warm up the Font Awesome webfont so the flame textures can upgrade from
    // the fallback drawing to the real fire glyph the moment it's available.
    let flameTexturesReady = false;
    const upgradeFlames = () => {
      if (flameTexturesReady || !flameSprites.length) return;
      if (!document.fonts || !document.fonts.check(FA_FONT, FIRE_GLYPH)) return;
      flameTexturesReady = true;
      flameSprites.forEach((fl) => {
        const texture = new THREE.CanvasTexture(makeFlameTexture(128));
        texture.colorSpace = THREE.SRGBColorSpace;
        disposables.push(texture);
        fl.material.map.dispose();
        fl.material.map = texture;
        fl.material.needsUpdate = true;
      });
    };
    if (document.fonts) {
      document.fonts
        .load(FA_FONT, FIRE_GLYPH)
        .then(upgradeFlames)
        .catch(() => {});
      document.fonts.ready.then(upgradeFlames).catch(() => {});
    }

    // Environment reflections (studio lighting map) — this is what sells the
    // glossy 3D balloon look on MeshStandardMaterial.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator
      .fromScene(new RoomEnvironment(), 0.04)
      .texture;

    // Moderate direct lights — enough to create a lit/dark gradient across
    // each balloon without washing the colours out.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const spotLight = new THREE.SpotLight(0xfff0f4, 0.9);
    spotLight.position.set(10, 16, 18);
    spotLight.castShadow = true;
    scene.add(spotLight);

    const fillLight = new THREE.DirectionalLight(0xffd2e0, 0.4);
    fillLight.position.set(-8, 3, 6);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, 5, -14);
    scene.add(rimLight);

    // Interaction state
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const tempVector = new THREE.Vector3();
    const forces = new Map();

    const initY = -25;
    const revolutionRadius = 4;
    const revolutionDuration = 1.6;
    const breathingAmplitude = 0.1;
    const breathingSpeed = 0.002;

    const timelines = [];
    const timers = [];
    let loadingComplete = false;

    const settleAll = () => {
      balloons.forEach((b) =>
        b.group.position.set(
          b.originalPosition.x,
          b.originalPosition.y,
          b.originalPosition.z
        )
      );
      flameSprites.forEach((fl) => {
        fl.position.y = fl.userData.baseY;
      });
    };

    if (reduceMotion) {
      // Reduced motion — everything just appears in place (no rise).
      settleAll();
      loadingComplete = true;
      timers.push(
        window.setTimeout(() => {
          onReadyRef.current?.();
        }, 150)
      );
    } else {
      // Balloons rise from below the screen in a sweeping revolution, and the
      // floating hypes drift up alongside them.
      balloons.forEach((b, i) => {
        const delay = i * 0.01;
        const tl = gsap
          .timeline()
          .to(b.group.position, {
            duration: revolutionDuration / 2,
            y: revolutionRadius,
            ease: "power1.out",
            delay,
            onUpdate() {
              const progress = this.progress();
              b.group.position.z =
                b.originalPosition.z +
                Math.sin(progress * Math.PI) * revolutionRadius;
            },
          })
          .to(b.group.position, {
            duration: revolutionDuration / 2,
            y: initY / 5,
            ease: "power1.out",
            onUpdate() {
              const progress = this.progress();
              b.group.position.z =
                b.originalPosition.z -
                Math.sin(progress * Math.PI) * revolutionRadius;
            },
          })
          .to(b.group.position, {
            duration: 0.55,
            x: b.originalPosition.x,
            y: b.originalPosition.y,
            z: b.originalPosition.z,
            ease: "power1.out",
          });
        timelines.push(tl);
      });

      flameSprites.forEach((fl, i) => {
        fl.position.y = initY;
        const tl = gsap.timeline();
        tl.to(fl.position, {
          duration: revolutionDuration + 0.5,
          y: fl.userData.baseY,
          ease: "power1.out",
          delay: i * 0.01,
        });
        timelines.push(tl);
      });

      timers.push(
        window.setTimeout(() => {
          loadingComplete = true;
          onReadyRef.current?.();
        }, (revolutionDuration + 0.9) * 1000)
      );
    }

    // Balloons start below the screen in the animated path.
    if (!reduceMotion) {
      balloons.forEach((b) => {
        b.group.position.y = initY;
      });
    }

    const onMouseMove = (event) => {
      if (!loadingComplete) return;
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(ballMeshes);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const balloon = balloons.find((b) => b.ball === hit);
        if (!balloon) return;
        const force = new THREE.Vector3();
        force
          .subVectors(intersects[0].point, balloon.group.position)
          .normalize()
          .multiplyScalar(0.2);
        forces.set(balloon.ball.uuid, force);
      }
    };

    function handleCollisions() {
      for (let i = 0; i < balloons.length; i++) {
        const a = balloons[i];
        const radiusA = a.radius;
        for (let j = i + 1; j < balloons.length; j++) {
          const b = balloons[j];
          const radiusB = b.radius;
          const distance = a.group.position.distanceTo(b.group.position);
          const minDistance = (radiusA + radiusB) * 1.2;
          if (distance < minDistance) {
            tempVector.subVectors(b.group.position, a.group.position);
            tempVector.normalize();
            const pushStrength = (minDistance - distance) * 0.4;
            a.group.position.sub(
              tempVector.clone().multiplyScalar(pushStrength)
            );
            b.group.position.add(tempVector.multiplyScalar(pushStrength));
          }
        }
      }
    }

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);

      if (loadingComplete) {
        const time = Date.now() * breathingSpeed;
        balloons.forEach((b, i) => {
          const offset = i * 0.2;
          const breathingY = Math.sin(time + offset) * breathingAmplitude;
          const breathingZ = Math.cos(time + offset) * breathingAmplitude * 0.5;

          const force = forces.get(b.ball.uuid);
          if (force) {
            b.group.position.add(force);
            force.multiplyScalar(0.95);
            if (force.length() < 0.01) forces.delete(b.ball.uuid);
          }

          const originalPos = b.originalPosition;
          tempVector.set(
            originalPos.x,
            originalPos.y + breathingY,
            originalPos.z + breathingZ
          );
          b.group.position.lerp(tempVector, 0.018);
        });

        handleCollisions();

        // Floating hypes bob (~5s drift) and spin gently.
        flameSprites.forEach((fl) => {
          fl.position.y =
            fl.userData.baseY +
            Math.sin(time * 0.6 + fl.userData.offset) * 0.22;
          fl.material.rotation += fl.userData.spin;
        });
      }

      renderer.render(scene, camera);
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("resize", onResize);
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      timelines.forEach((tl) => tl.kill());
      timers.forEach((t) => window.clearTimeout(t));
      disposables.forEach((d) => d.dispose());
      sphereGeometry.dispose();
      stringGeometry.dispose();
      knotGeometry.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, []);

  return <canvas ref={canvasRef} className="webgl" aria-hidden="true" />;
}
