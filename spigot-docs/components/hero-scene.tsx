'use client';

import { useEffect, useRef } from 'react';
import type { Mesh, Vector3 } from 'three';

/**
 * Spigot hero scene — Three.js metered-tap visual.
 *
 * Ported from src/ui/scene.js. Renders a 3D spigot assembly with
 * falling token physics. Uses dynamic import for three.js to avoid
 * server-side rendering issues.
 */
export function HeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function init() {
      const THREE = await import('three');
      const canvas = canvasRef.current;
      if (!canvas) return;

      // --- Renderer & Camera ---
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 600, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        38,
        (canvas.clientWidth || 800) / (canvas.clientHeight || 600),
        0.1,
        50,
      );
      camera.position.set(0, 0.35, 5.4);

      // --- High-Dynamic Studio Light Rig ---
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x060907);

      const envKey = new THREE.DirectionalLight(0xffffff, 5.0);
      envKey.position.set(4, 9, 5);
      envScene.add(envKey);

      const envMint = new THREE.DirectionalLight(0x86efac, 3.5);
      envMint.position.set(-6, 2, -3);
      envScene.add(envMint);

      const envEmerald = new THREE.DirectionalLight(0x059669, 3.0);
      envEmerald.position.set(0, -6, 5);
      envScene.add(envEmerald);

      scene.environment = pmrem.fromScene(envScene).texture;

      const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
      keyLight.position.set(5, 7, 5);
      scene.add(keyLight);

      const rimLight = new THREE.SpotLight(0x4ade80, 4.5, 15, Math.PI / 3, 0.5);
      rimLight.position.set(-5, 1, -2);
      scene.add(rimLight);

      const fillLight = new THREE.DirectionalLight(0xdcfce7, 1.4);
      fillLight.position.set(2, -3, 3);
      scene.add(fillLight);

      scene.add(new THREE.AmbientLight(0xf0fdf4, 0.45));

      // --- Procedural Texture Generators ---
      function createHeavyCastMaps() {
        const size = window.innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4 ? 512 : 1024;
        const k = size / 512;
        const cv = document.createElement('canvas');
        cv.width = size;
        cv.height = size;
        const ctx = cv.getContext('2d')!;

        const heightMap = new Float32Array(size * size);

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const idx = y * size + x;
            const s1 = Math.sin(x * 0.02) * Math.cos(y * 0.02) * 0.25;
            const s2 = Math.sin((x + y) * 0.04) * 0.15;
            heightMap[idx] = 0.5 + s1 + s2;
          }
        }

        for (let i = 0; i < Math.round(4500 * k * k / 4); i++) {
          const cx = Math.floor(Math.random() * size);
          const cy = Math.floor(Math.random() * size);
          const rad = 2 + Math.floor(Math.random() * 6);
          const depth = (Math.random() - 0.5) * 0.35;

          for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
              if (dx * dx + dy * dy <= rad * rad) {
                const px = (cx + dx + size) % size;
                const py = (cy + dy + size) % size;
                heightMap[py * size + px] += depth * (1 - Math.sqrt(dx * dx + dy * dy) / rad);
              }
            }
          }
        }

        for (let i = 0; i < heightMap.length; i++) {
          heightMap[i] += (Math.random() - 0.5) * 0.22;
          heightMap[i] = THREE.MathUtils.clamp(heightMap[i], 0, 1);
        }

        const normalImg = ctx.createImageData(size, size);
        const nd = normalImg.data;
        const strength = 6.0;

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const l = heightMap[y * size + ((x - 1 + size) % size)];
            const r = heightMap[y * size + ((x + 1) % size)];
            const t = heightMap[((y - 1 + size) % size) * size + x];
            const b = heightMap[((y + 1) % size) * size + x];

            const dx = (r - l) * strength;
            const dy = (b - t) * strength;
            const dz = 1.0;

            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const nx = (dx / len) * 0.5 + 0.5;
            const ny = (dy / len) * 0.5 + 0.5;
            const nz = (dz / len) * 0.5 + 0.5;

            const pIdx = (y * size + x) * 4;
            nd[pIdx] = Math.floor(nx * 255);
            nd[pIdx + 1] = Math.floor(ny * 255);
            nd[pIdx + 2] = Math.floor(nz * 255);
            nd[pIdx + 3] = 255;
          }
        }
        ctx.putImageData(normalImg, 0, 0);
        const normalTex = new THREE.CanvasTexture(cv);
        normalTex.wrapS = THREE.RepeatWrapping;
        normalTex.wrapT = THREE.RepeatWrapping;
        normalTex.repeat.set(4, 4);

        const rCv = document.createElement('canvas');
        rCv.width = 512;
        rCv.height = 512;
        const rCtx = rCv.getContext('2d')!;
        const rImg = rCtx.createImageData(512, 512);
        const rd = rImg.data;

        for (let y = 0; y < 512; y++) {
          for (let x = 0; x < 512; x++) {
            const sample = heightMap[(y * k) * size + (x * k)];
            const roughnessVal = Math.floor(THREE.MathUtils.lerp(235, 120, sample));
            const pIdx = (y * 512 + x) * 4;
            rd[pIdx] = roughnessVal;
            rd[pIdx + 1] = roughnessVal;
            rd[pIdx + 2] = roughnessVal;
            rd[pIdx + 3] = 255;
          }
        }
        rCtx.putImageData(rImg, 0, 0);
        const roughTex = new THREE.CanvasTexture(rCv);
        roughTex.wrapS = THREE.RepeatWrapping;
        roughTex.wrapT = THREE.RepeatWrapping;
        roughTex.repeat.set(4, 4);

        return { normalTex, roughTex };
      }

      function createKnurlMap() {
        const cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 512;
        const ctx = cv.getContext('2d')!;
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 512, 512);

        const step = 8;
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 2.2;
        for (let i = -512; i < 1024; i += step) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 512, 512);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(i, 512);
          ctx.lineTo(i + 512, 0);
          ctx.stroke();
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        for (let i = -512; i < 1024; i += step) {
          ctx.beginPath();
          ctx.moveTo(i + 1, 0);
          ctx.lineTo(i + 513, 512);
          ctx.stroke();
        }

        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(14, 4);
        return tex;
      }

      function createTempoTexture() {
        const cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 512;
        const ctx = cv.getContext('2d')!;

        const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 250);
        grad.addColorStop(0, '#0f1712');
        grad.addColorStop(1, '#050a07');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);

        ctx.beginPath();
        ctx.arc(256, 256, 238, 0, Math.PI * 2);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 12;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(256, 256, 218, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.save();
        ctx.translate(256, 256);
        ctx.transform(1, 0, -0.22, 1, 0, 0);
        ctx.fillStyle = '#ffffff';

        ctx.beginPath();
        ctx.roundRect(-135, -145, 270, 74, 12);
        ctx.fill();

        ctx.beginPath();
        ctx.roundRect(-44, -85, 88, 230, 10);
        ctx.fill();
        ctx.restore();

        const tex = new THREE.CanvasTexture(cv);
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        return tex;
      }

      const { normalTex: castNormal, roughTex: castRough } = createHeavyCastMaps();
      const knurlMap = createKnurlMap();
      const tempoTex = createTempoTexture();

      // --- Materials ---
      const lightGreenMat = new THREE.MeshPhysicalMaterial({
        color: 0x92dfaf,
        metalness: 0.85,
        roughness: 0.65,
        roughnessMap: castRough,
        normalMap: castNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        clearcoat: 0.0,
      });

      const darkEmeraldMat = new THREE.MeshPhysicalMaterial({
        color: 0x094726,
        emissive: 0x011b0b,
        metalness: 0.88,
        roughness: 0.6,
        roughnessMap: castRough,
        normalMap: castNormal,
        normalScale: new THREE.Vector2(0.75, 0.75),
        clearcoat: 0.0,
      });

      const knurledGripMat = new THREE.MeshPhysicalMaterial({
        color: 0x16241c,
        metalness: 0.9,
        roughness: 0.62,
        bumpMap: knurlMap,
        bumpScale: 0.022,
      });

      const industrialBoltMat = new THREE.MeshPhysicalMaterial({
        color: 0x7ecc98,
        metalness: 0.9,
        roughness: 0.58,
        roughnessMap: castRough,
        normalMap: castNormal,
        normalScale: new THREE.Vector2(0.7, 0.7),
      });

      const tokenFaceMat = new THREE.MeshStandardMaterial({
        map: tempoTex,
        metalness: 0.9,
        roughness: 0.22,
        bumpMap: tempoTex,
        bumpScale: 0.005,
      });

      const tokenEdgeMat = new THREE.MeshStandardMaterial({
        color: 0x4ade80,
        emissive: 0x054d24,
        metalness: 0.95,
        roughness: 0.24,
        bumpMap: knurlMap,
        bumpScale: 0.006,
      });

      // --- Spigot Assembly ---
      const spigot = new THREE.Group();

      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.2, 64), lightGreenMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-0.95, 0.35, 0);
      spigot.add(pipe);

      const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.72, 64), darkEmeraldMat);
      chamber.position.set(0.2, 0.35, 0);
      spigot.add(chamber);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.36, 48), lightGreenMat);
      stem.position.set(0.2, 0.86, 0);
      spigot.add(stem);

      const knob = new THREE.Group();
      knob.position.set(0.2, 1.07, 0);

      const knobGripRim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.055, 36, 96), knurledGripMat);
      knobGripRim.rotation.x = Math.PI / 2;
      knob.add(knobGripRim);

      for (let i = 0; i < 3; i++) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.52, 24), darkEmeraldMat);
        spoke.rotation.y = (i * Math.PI * 2) / 3;
        spoke.rotation.z = Math.PI / 2;
        knob.add(spoke);
      }

      const hexCap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.14, 6), lightGreenMat);
      knob.add(hexCap);
      spigot.add(knob);

      const leftBoltGroup = new THREE.Group();
      leftBoltGroup.position.set(-0.15, 0.35, 0);

      const leftWasher = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 32), darkEmeraldMat);
      leftWasher.rotation.z = Math.PI / 2;
      leftWasher.position.set(0.01, 0, 0);
      leftBoltGroup.add(leftWasher);

      const leftHexNut = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 6), industrialBoltMat);
      leftHexNut.rotation.z = Math.PI / 2;
      leftHexNut.position.set(-0.06, 0, 0);
      leftBoltGroup.add(leftHexNut);

      spigot.add(leftBoltGroup);

      const rightBoltGroup = new THREE.Group();
      rightBoltGroup.position.set(0.55, 0.35, 0);

      const rightWasher = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 32), darkEmeraldMat);
      rightWasher.rotation.z = Math.PI / 2;
      rightWasher.position.set(-0.01, 0, 0);
      rightBoltGroup.add(rightWasher);

      const rightHexNut = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 6), industrialBoltMat);
      rightHexNut.rotation.z = Math.PI / 2;
      rightHexNut.position.set(0.06, 0, 0);
      rightBoltGroup.add(rightHexNut);

      spigot.add(rightBoltGroup);

      const spoutCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.62, 0.35, 0),
        new THREE.Vector3(0.78, 0.35, 0),
        new THREE.Vector3(0.98, 0.18, 0),
        new THREE.Vector3(1.02, -0.42, 0),
      ]);
      const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 64, 0.21, 36, false), lightGreenMat);
      spigot.add(spout);

      const nozzleLip = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.038, 32, 64), lightGreenMat);
      nozzleLip.position.set(1.02, -0.42, 0);
      nozzleLip.rotation.x = Math.PI / 2;
      spigot.add(nozzleLip);

      scene.add(spigot);
      spigot.rotation.y = Math.PI;

      // --- Falling Token Pool ---
      const TOKEN_COUNT = 30;
      const coinGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.03, 40);
      const coinMaterials = [tokenEdgeMat, tokenFaceMat, tokenFaceMat];

      const tokensGroup = new THREE.Group();
      scene.add(tokensGroup);

      const tokenMeshes: Mesh[] = [];
      const tokenStates: { active: boolean; vel: Vector3; rotVel: Vector3 }[] = [];

      for (let i = 0; i < TOKEN_COUNT; i++) {
        const mesh = new THREE.Mesh(coinGeo, coinMaterials);
        mesh.position.set(0, -9999, 0);
        mesh.scale.set(0, 0, 0);
        mesh.visible = false;
        tokensGroup.add(mesh);
        tokenMeshes.push(mesh);
        tokenStates.push({
          active: false,
          vel: new THREE.Vector3(),
          rotVel: new THREE.Vector3(),
        });
      }

      let nextTokenIdx = 0;
      let spawnTimer = 0;
      const nozzleWorldPos = new THREE.Vector3();

      function spawnToken() {
        nozzleLip.getWorldPosition(nozzleWorldPos);

        const mesh = tokenMeshes[nextTokenIdx];
        const state = tokenStates[nextTokenIdx];

        mesh.position.copy(nozzleWorldPos);
        mesh.position.y -= 0.06;
        mesh.position.x += (Math.random() - 0.5) * 0.03;
        mesh.position.z += (Math.random() - 0.5) * 0.03;

        mesh.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
        mesh.scale.set(1, 1, 1);
        mesh.visible = true;

        state.active = true;
        state.vel.set(
          (Math.random() - 0.5) * 0.08,
          -0.8 - Math.random() * 0.4,
          (Math.random() - 0.5) * 0.08,
        );
        state.rotVel.set(
          (Math.random() - 0.5) * 5.0,
          (Math.random() - 0.5) * 4.0,
          (Math.random() - 0.5) * 3.0,
        );

        nextTokenIdx = (nextTokenIdx + 1) % TOKEN_COUNT;
      }

      // --- Parallax Tracking ---
      let targetX = 0;
      let targetY = 0;

      const onMouseMove = (e: MouseEvent) => {
        targetX = (e.clientX / window.innerWidth - 0.5) * 0.45;
        targetY = -(e.clientY / window.innerHeight - 0.5) * 0.25;
      };
      window.addEventListener('mousemove', onMouseMove);

      // --- Layout ---
      function layout() {
        const narrow = window.matchMedia('(max-width: 900px)').matches;
        const z = narrow ? Math.max(5.4, 5.3 / camera.aspect) : 5.4;
        const H = 0.6887 * z;
        const W = H * camera.aspect;
        return { z, x: -0.4 + W * (narrow ? 0.06 : 0.27), y: narrow ? -H * 0.2 : 0 };
      }

      const clock = new THREE.Clock();
      let spigotOn = true;

      function animate() {
        // Schedule the next frame *before* the visibility bail-out. Returning
        // early here would permanently kill the loop once the hero scrolls out
        // of view, and the observer can never restart it.
        requestAnimationFrame(animate);
        if (!spigotOn) return;
        const dt = Math.min(clock.getDelta(), 0.1);

        knob.rotation.y += dt * 2.5;

        const L = layout();
        camera.position.z = L.z;
        spigot.position.x = THREE.MathUtils.lerp(spigot.position.x, targetX + L.x, 0.08);
        spigot.position.y = THREE.MathUtils.lerp(spigot.position.y, targetY + L.y, 0.08);
        spigot.rotation.y = THREE.MathUtils.lerp(spigot.rotation.y, Math.PI + targetX * 0.45, 0.08);

        spawnTimer += dt * 5.0;
        while (spawnTimer >= 1.0) {
          spawnToken();
          spawnTimer -= 1.0;
        }

        for (let i = 0; i < TOKEN_COUNT; i++) {
          const state = tokenStates[i];
          if (!state.active) continue;

          const mesh = tokenMeshes[i];
          state.vel.y -= 10.5 * dt;
          mesh.position.addScaledVector(state.vel, dt);
          mesh.rotation.x += state.rotVel.x * dt;
          mesh.rotation.y += state.rotVel.y * dt;
          mesh.rotation.z += state.rotVel.z * dt;

          if (mesh.position.y < -3.8) {
            state.active = false;
            mesh.visible = false;
            mesh.scale.set(0, 0, 0);
            mesh.position.set(0, -9999, 0);
          }
        }

        renderer.render(scene, camera);
      }

      animate();
      canvas.classList.add('ready');

      const onResize = () => {
        camera.aspect = (canvas.clientWidth || 800) / (canvas.clientHeight || 600);
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 600, false);
      };
      window.addEventListener('resize', onResize);

      // Pause when off-screen
      const observer = new IntersectionObserver(
        (entries) => {
          spigotOn = entries[0]?.isIntersecting ?? true;
        },
        { threshold: 0 },
      );
      observer.observe(canvas);

      cleanup = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', onResize);
        observer.disconnect();
        spigotOn = false;
        renderer.dispose();
        pmrem.dispose();
      };
    }

    init();

    return () => {
      cleanup?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full opacity-0 transition-opacity duration-1000 ready:opacity-100"
      aria-hidden="true"
    />
  );
}
