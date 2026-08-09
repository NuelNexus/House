import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { POSITIONS, RADII } from "../data/sphereData";

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

    // WebGL can be unavailable (headless browsers, some laptops with the
    // GPU disabled, remote desktops). THREE throws deep inside WebGLRenderer
    // when the context comes back null, which used to crash the whole app.
    // Fall back to a static gradient and let the intro finish normally.
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
      // No WebGL — keep the canvas empty (it sits behind the page content)
      // and signal the intro is done so the site shows normally.
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

    // Glossy pink bubbles: standard material + environment reflections + a
    // warm emissive core give each sphere a clear 3D light/dark gradient.
    const material = new THREE.MeshStandardMaterial({
      color: "#eba2b3",
      metalness: 0.12,
      roughness: 0.28,
      emissive: "#ff5f7a",
      emissiveIntensity: 0.25,
    });

    const group = new THREE.Group();
    const spheres = [];
    const geometry = new THREE.SphereGeometry(1, 64, 64);

    POSITIONS.forEach((pos, index) => {
      const mesh = new THREE.Mesh(geometry, material);
      const radius = RADII[index] ?? 0.4;
      mesh.scale.setScalar(radius);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData = { originalPosition: { ...pos }, radius };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      spheres.push(mesh);
      group.add(mesh);
    });

    scene.add(group);

    let loadingComplete = false;

    // The tower — centerpiece model, sat right where the bubble cluster is.
    // Served from /public so the 22MB binary stays out of the JS bundle.
    const towerGroup = new THREE.Group();
    scene.add(towerGroup);
    let towerModel = null;
    let towerMixer = null;

    const showTower = () => {
      if (!towerModel || towerGroup.visible) return;
      towerGroup.visible = true;
      gsap.fromTo(
        towerGroup.scale,
        { x: 0.7, y: 0.7, z: 0.7 },
        { x: 1, y: 1, z: 1, duration: 0.9, ease: "power2.out" }
      );
    };

    new GLTFLoader().load(
      "/tower.glb",
      (gltf) => {
        towerModel = gltf.scene;
        // Fit the model so its longest side is ~6 scene units (the cluster
        // spans about that, so the tower feels at home in the middle).
        const box = new THREE.Box3().setFromObject(towerModel);
        const size = new THREE.Vector3();
        box.getSize(size);
        const longest = Math.max(size.x, size.y, size.z) || 1;
        const scale = 6 / longest;
        const center = new THREE.Vector3();
        box.getCenter(center);
        towerModel.scale.setScalar(scale);
        towerModel.position.sub(center.multiplyScalar(scale));

        // The GLB uses the deprecated KHR_materials_pbrSpecularGlossiness
        // extension, which three.js skips — so most materials come through
        // as flat defaults. Give anything without a real texture the same
        // glossy pink treatment as the bubbles so the tower feels at home.
        const pinkMat = new THREE.MeshStandardMaterial({
          color: "#e9b9c6",
          metalness: 0.45,
          roughness: 0.32,
          emissive: "#ff5f7a",
          emissiveIntensity: 0.12,
        });
        towerModel.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            if (mats.some((m) => m && !m.map)) {
              mats.forEach((m) => m && m.dispose());
              obj.material = pinkMat;
            }
          }
        });
        towerGroup.add(towerModel);

        // Play the model's own idle animation if it has one.
        if (gltf.animations && gltf.animations.length) {
          towerMixer = new THREE.AnimationMixer(towerModel);
          towerMixer.clipAction(gltf.animations[0]).play();
        }

        // If the intro is already done, fade the tower in right away.
        // (Respect reduced motion — no tween, just show it.)
        if (loadingComplete) {
          if (reduceMotion) towerGroup.visible = true;
          else showTower();
        }
      },
      undefined,
      (err) => console.warn("Couldn't load the tower model:", err)
    );

    // Environment reflections (studio lighting map) — this is what sells the
    // glossy 3D bubble look on MeshStandardMaterial.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator
      .fromScene(new RoomEnvironment(), 0.04)
      .texture;

    // The environment map carries most of the shading now, so keep the
    // direct lights moderate — enough to create a lit/dark gradient across
    // each bubble without washing the pink out.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    // Warm key light — bright highlight across each sphere's lit side
    const spotLight = new THREE.SpotLight(0xfff0f4, 0.9);
    spotLight.position.set(10, 16, 18);
    spotLight.castShadow = true;
    scene.add(spotLight);

    // Pink-tinted fill from the front-left for soft color bounce
    const fillLight = new THREE.DirectionalLight(0xffd2e0, 0.4);
    fillLight.position.set(-8, 3, 6);
    scene.add(fillLight);

    // Rim light from behind to pop the silhouettes
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

    if (reduceMotion) {
      loadingComplete = true;
      timers.push(
        window.setTimeout(() => {
          if (towerModel) towerGroup.visible = true;
          onReadyRef.current?.();
        }, 150)
      );
    } else {
      // Spheres rise from below screen in a sweeping revolution
      spheres.forEach((sphere, i) => {
        const delay = i * 0.01;
        const tl = gsap
          .timeline()
          .to(sphere.position, {
            duration: revolutionDuration / 2,
            y: revolutionRadius,
            ease: "power1.out",
            delay,
            onUpdate() {
              const progress = this.progress();
              sphere.position.z =
                sphere.userData.originalPosition.z +
                Math.sin(progress * Math.PI) * revolutionRadius;
            },
          })
          .to(sphere.position, {
            duration: revolutionDuration / 2,
            y: initY / 5,
            ease: "power1.out",
            onUpdate() {
              const progress = this.progress();
              sphere.position.z =
                sphere.userData.originalPosition.z -
                Math.sin(progress * Math.PI) * revolutionRadius;
            },
          })
          .to(sphere.position, {
            duration: 0.55,
            x: sphere.userData.originalPosition.x,
            y: sphere.userData.originalPosition.y,
            z: sphere.userData.originalPosition.z,
            ease: "power1.out",
          });
        timelines.push(tl);
      });

      timers.push(
        window.setTimeout(() => {
          loadingComplete = true;
          showTower();
          onReadyRef.current?.();
        }, (revolutionDuration + 0.9) * 1000)
      );
    }

    // Spheres start below the screen
    spheres.forEach((sphere) => {
      sphere.position.y = initY;
    });

    const onMouseMove = (event) => {
      if (!loadingComplete) return;
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(spheres);
      if (intersects.length > 0) {
        const hoveredSphere = intersects[0].object;
        const force = new THREE.Vector3();
        force
          .subVectors(intersects[0].point, hoveredSphere.position)
          .normalize()
          .multiplyScalar(0.2);
        forces.set(hoveredSphere.uuid, force);
      }
    };

    function handleCollisions() {
      for (let i = 0; i < spheres.length; i++) {
        const sphereA = spheres[i];
        const radiusA = sphereA.userData.radius;
        for (let j = i + 1; j < spheres.length; j++) {
          const sphereB = spheres[j];
          const radiusB = sphereB.userData.radius;
          const distance = sphereA.position.distanceTo(sphereB.position);
          const minDistance = (radiusA + radiusB) * 1.2;
          if (distance < minDistance) {
            tempVector.subVectors(sphereB.position, sphereA.position);
            tempVector.normalize();
            const pushStrength = (minDistance - distance) * 0.4;
            sphereA.position.sub(tempVector.clone().multiplyScalar(pushStrength));
            sphereB.position.add(tempVector.multiplyScalar(pushStrength));
          }
        }
      }
    }

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (loadingComplete) {
        const time = Date.now() * breathingSpeed;
        spheres.forEach((sphere, i) => {
          const offset = i * 0.2;
          const breathingY = Math.sin(time + offset) * breathingAmplitude;
          const breathingZ = Math.cos(time + offset) * breathingAmplitude * 0.5;

          const force = forces.get(sphere.uuid);
          if (force) {
            sphere.position.add(force);
            force.multiplyScalar(0.95);
            if (force.length() < 0.01) forces.delete(sphere.uuid);
          }

          const originalPos = sphere.userData.originalPosition;
          tempVector.set(
            originalPos.x,
            originalPos.y + breathingY,
            originalPos.z + breathingZ
          );
          sphere.position.lerp(tempVector, 0.018);
        });

        handleCollisions();

        // Slow spin for the tower centerpiece once it's on screen.
        if (towerGroup.visible) {
          towerGroup.rotation.y += 0.1 * delta;
          if (towerMixer) towerMixer.update(delta);
        }
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
      if (towerModel) {
        towerModel.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(
              (m) => m.dispose()
            );
          }
        });
      }
      pmremGenerator.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, []);

  return <canvas ref={canvasRef} className="webgl" aria-hidden="true" />;
}
