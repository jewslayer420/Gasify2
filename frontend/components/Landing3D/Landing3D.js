'use client';
import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Stars } from '@react-three/drei';
import * as THREE from 'three';

// Full-page 3D backdrop (fixed canvas behind all DOM content). One camera
// journey driven by TOTAL body scroll: hero drift → car drives to the lit
// station, LED totem rolls red→green → pull-back into a field of glowing
// station dots under the map/countries sections. Car: Ferrari 458 GLB from
// the three.js examples (credit: vicent091036 — see /credits).
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => t * t * (3 - 2 * t);
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

function ledCanvas() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  return c;
}

function Scene({ progressRef }) {
  const car = useGLTF('/models/car.glb');
  const carRef = useRef();
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const totemTex = useRef();
  const canvas = useMemo(() => (typeof document !== 'undefined' ? ledCanvas() : null), []);
  const dots = useRef();

  const carModel = useMemo(() => {
    const m = car.scene.clone(true);
    m.traverse(o => {
      if (o.isMesh) {
        o.castShadow = false;
        if (o.material?.name === 'body') o.material = new THREE.MeshStandardMaterial({ color: '#1B2130', metalness: 0.8, roughness: 0.3 });
      }
    });
    m.scale.setScalar(0.9);
    return m;
  }, [car]);

  // 800 glowing station dots scattered on the ground plane
  const dotData = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 800; i++) {
      arr.push({
        x: (Math.sin(i * 127.1) * 0.5 + 0.5) * 400 - 200,
        z: (Math.sin(i * 311.7) * 0.5 + 0.5) * 400 - 220,
        c: ['#37D3A0', '#37D3A0', '#E8A23D', '#37D3A0', '#E25A5A'][i % 5],
      });
    }
    return arr;
  }, []);

  useFrame(() => {
    const p = progressRef.current;

    // Car: far left → parked at the station (x≈2) during the story band
    const drive = ease(seg(p, 0.14, 0.34));
    if (carRef.current) {
      carRef.current.position.set(lerp(-40, -1, drive), 0, 7);
      carRef.current.rotation.y = Math.PI / 2;
    }

    // LED totem price roll
    if (canvas && totemTex.current) {
      const roll = ease(seg(p, 0.3, 0.45));
      const price = (2.09 + (1.52 - 2.09) * roll).toFixed(2);
      const color = price <= 1.6 ? '#37D3A0' : price <= 1.9 ? '#E8A23D' : '#E25A5A';
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#07090D'; ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#EDEFF5'; ctx.font = '700 30px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('GASIFY', 128, 38);
      ctx.fillStyle = color; ctx.font = '700 52px monospace';
      ctx.shadowColor = color; ctx.shadowBlur = 16;
      ctx.fillText(price, 128, 100);
      ctx.shadowBlur = 0;
      totemTex.current.needsUpdate = true;
    }

    // Dots fade/raise in for the constellation → map band
    const dotP = ease(seg(p, 0.5, 0.66));
    if (dots.current) {
      dots.current.material.opacity = dotP * 0.9;
      dots.current.visible = dotP > 0.01;
    }
  });

  useFrame(({ camera }) => {
    const p = progressRef.current;
    // Camera keyframes: [x, y, z, tx, ty, tz]
    const K = [
      [0.0, [-18, 5, 34, -4, 2, 0]],   // hero: wide side view, station right
      [0.22, [-8, 4, 26, 0, 2, 3]],    // approach with the car
      [0.42, [10, 5, 24, 8, 3, 1]],    // at the pumps, totem in frame
      [0.6, [0, 26, 30, 0, 0, -10]],   // pull up: constellation reveals
      [0.8, [0, 60, 40, 0, 0, -40]],   // high map flyover
      [1.0, [0, 80, 10, 0, 0, -60]],   // top-down over the dot field
    ];
    let i = 0;
    while (i < K.length - 2 && p > K[i + 1][0]) i++;
    const [pa, a] = K[i], [pb, b] = K[i + 1];
    const t = ease(seg(p, pa, pb));
    camera.position.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
    camTarget.set(lerp(a[3], b[3], t), lerp(a[4], b[4], t), lerp(a[5], b[5], t));
    camera.lookAt(camTarget);
  });

  return (
    <>
      <fog attach="fog" args={['#04060A', 40, 180]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#22304A', '#0A0D13', 0.5]} />
      <directionalLight position={[10, 20, 10]} intensity={0.5} color="#8FA3C8" />
      <Stars radius={220} depth={40} count={1600} factor={3} fade speed={0.4} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#0A0D13" roughness={1} />
      </mesh>

      {/* Station: canopy, posts, pumps, totem */}
      <group position={[8, 0, 0]}>
        <mesh position={[0, 6.2, 0]}>
          <boxGeometry args={[13, 0.5, 8]} />
          <meshStandardMaterial color="#10141F" />
        </mesh>
        <mesh position={[0, 5.92, 0]}>
          <boxGeometry args={[13.2, 0.1, 8.2]} />
          <meshStandardMaterial color="#0F2A21" emissive="#37D3A0" emissiveIntensity={0.55} />
        </mesh>
        {[-6.5, 6.5].map(x => (
          <mesh key={x} position={[x, 3, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 6, 12]} />
            <meshStandardMaterial color="#141926" />
          </mesh>
        ))}
        {[-2.5, 2.5].map(x => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 1.1, 0]}>
              <boxGeometry args={[1.4, 2.2, 1]} />
              <meshStandardMaterial color="#1A2030" />
            </mesh>
            <mesh position={[0, 1.6, 0.51]}>
              <planeGeometry args={[1, 0.6]} />
              <meshStandardMaterial color="#0B0E15" emissive="#37D3A0" emissiveIntensity={0.8} />
            </mesh>
          </group>
        ))}
        <pointLight position={[0, 5.2, 0]} intensity={40} color="#CFF5E6" distance={22} />
        {/* Totem with live LED texture */}
        <group position={[10.5, 0, 3]}>
          <mesh position={[0, 2.6, 0]}>
            <boxGeometry args={[0.3, 5.2, 0.3]} />
            <meshStandardMaterial color="#141926" />
          </mesh>
          <mesh position={[0, 5.6, 0]}>
            <boxGeometry args={[3, 1.8, 0.4]} />
            <meshStandardMaterial color="#07090D" />
          </mesh>
          <mesh position={[0, 5.6, 0.21]}>
            <planeGeometry args={[2.8, 1.6]} />
            <meshBasicMaterial toneMapped={false}>
              {canvas && <canvasTexture ref={totemTex} attach="map" image={canvas} />}
            </meshBasicMaterial>
          </mesh>
        </group>
      </group>

      {/* The car */}
      <group ref={carRef} position={[-38, 0, 4]}>
        <primitive object={carModel} />
        <pointLight position={[2.6, 0.8, 0]} intensity={6} color="#F2ECCF" distance={10} />
      </group>

      {/* Constellation / map dot field */}
      <points ref={dots} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={800} itemSize={3}
            array={useMemo(() => {
              const a = new Float32Array(800 * 3);
              dotData.forEach((d, i) => { a[i * 3] = d.x; a[i * 3 + 1] = 0.5; a[i * 3 + 2] = d.z; });
              return a;
            }, [dotData])} />
          <bufferAttribute attach="attributes-color" count={800} itemSize={3}
            array={useMemo(() => {
              const a = new Float32Array(800 * 3);
              const c = new THREE.Color();
              dotData.forEach((d, i) => { c.set(d.c); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; });
              return a;
            }, [dotData])} />
        </bufferGeometry>
        <pointsMaterial size={1.6} vertexColors transparent opacity={0} sizeAttenuation toneMapped={false} />
      </points>
    </>
  );
}

export default function Landing3D() {
  const progressRef = useRef(0);

  // Global page progress off the BODY scroller (see globals.css height:100%)
  function onCreated() {
    const update = () => {
      const b = document.body;
      progressRef.current = clamp01(b.scrollTop / Math.max(1, b.scrollHeight - window.innerHeight));
    };
    update();
    document.addEventListener('scroll', update, { capture: true, passive: true });
  }

  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null; // static DOM page stands on its own
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 42, near: 0.5, far: 300 }} gl={{ antialias: true }} onCreated={onCreated}>
        <color attach="background" args={['#04060A']} />
        <Suspense fallback={null}>
          <Scene progressRef={progressRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload('/models/car.glb');
