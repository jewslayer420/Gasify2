'use client';
import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Stars, MeshReflectorMaterial, ContactShadows, Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

// Full-page 3D backdrop. The "premium night scene" recipe: bloom on every
// emissive, a blurred reflective floor (wet asphalt), a procedural env map so
// the car paint actually reflects, contact shadows, fog and a tight camera.
// Car: Ferrari 458 GLB from the three.js examples (credit: vicent091036).
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => t * t * (3 - 2 * t);
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

const GREEN = '#37D3A0';

function ledCanvas() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  return c;
}

// Round glowing sprite for the constellation dots
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function Pump({ x }) {
  return (
    <group position={[x, 0, 0]}>
      <RoundedBox args={[1.5, 2.3, 1.05]} radius={0.09} position={[0, 1.15, 0]}>
        <meshStandardMaterial color="#232B3E" metalness={0.4} roughness={0.35} />
      </RoundedBox>
      <mesh position={[0, 2.32, 0]}>
        <boxGeometry args={[1.56, 0.14, 1.1]} />
        <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.62, 0.54]}>
        <planeGeometry args={[1.05, 0.62]} />
        <meshBasicMaterial color="#0E1420" />
      </mesh>
      <mesh position={[0, 1.62, 0.545]}>
        <planeGeometry args={[0.92, 0.5]} />
        <meshBasicMaterial color={GREEN} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0.55, 1.3, 0.35]} rotation={[0, 0, -0.4]}>
        <capsuleGeometry args={[0.07, 0.4, 6, 12]} />
        <meshStandardMaterial color="#39445F" metalness={0.6} roughness={0.4} />
      </mesh>
      <RoundedBox args={[1.9, 0.24, 1.5]} radius={0.06} position={[0, 0.12, 0]}>
        <meshStandardMaterial color="#1A2130" roughness={0.7} />
      </RoundedBox>
    </group>
  );
}

function Scene({ progressRef }) {
  const car = useGLTF('/models/car.glb');
  const carRef = useRef();
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const totemTex = useRef();
  const canvas = useMemo(() => (typeof document !== 'undefined' ? ledCanvas() : null), []);
  const dots = useRef();
  const spriteTex = useMemo(() => dotTexture(), []);

  const carModel = useMemo(() => {
    const m = car.scene.clone(true);
    m.traverse(o => {
      if (o.isMesh && o.material) {
        if (o.material.name === 'body') {
          o.material = new THREE.MeshPhysicalMaterial({
            color: '#B3121C', metalness: 0.9, roughness: 0.25,
            clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6,
          });
        } else {
          o.material.envMapIntensity = 0.8;
        }
      }
    });
    m.scale.setScalar(1.05);
    return m;
  }, [car]);

  const dotData = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 700; i++) {
      arr.push({
        x: (Math.sin(i * 127.1) * 0.5 + 0.5) * 360 - 180,
        z: (Math.sin(i * 311.7) * 0.5 + 0.5) * 360 - 200,
        c: [GREEN, GREEN, '#E8A23D', GREEN, '#E25A5A'][i % 5],
      });
    }
    return arr;
  }, []);
  const dotPositions = useMemo(() => {
    const a = new Float32Array(700 * 3);
    dotData.forEach((d, i) => { a[i * 3] = d.x; a[i * 3 + 1] = 0.6; a[i * 3 + 2] = d.z; });
    return a;
  }, [dotData]);
  const dotColors = useMemo(() => {
    const a = new Float32Array(700 * 3);
    const c = new THREE.Color();
    dotData.forEach((d, i) => { c.set(d.c); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; });
    return a;
  }, [dotData]);

  useFrame(() => {
    const p = progressRef.current;

    const drive = ease(seg(p, 0.13, 0.28));
    if (carRef.current) {
      carRef.current.position.set(lerp(-42, 5.2, drive), 0, 6.2);
      carRef.current.rotation.y = Math.PI / 2;
    }

    if (canvas && totemTex.current) {
      const roll = ease(seg(p, 0.26, 0.36));
      const price = (2.09 + (1.52 - 2.09) * roll).toFixed(2);
      const color = price <= 1.6 ? GREEN : price <= 1.9 ? '#E8A23D' : '#E25A5A';
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#05070C'; ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#EDEFF5'; ctx.font = '800 56px sans-serif'; ctx.textAlign = 'center';
      ctx.letterSpacing = '10px';
      ctx.fillText('GASIFY', 262, 76);
      ctx.strokeStyle = '#242C40'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(60, 102); ctx.lineTo(452, 102); ctx.stroke();
      ctx.fillStyle = '#7A8296'; ctx.font = '700 26px sans-serif'; ctx.letterSpacing = '6px';
      ctx.fillText('DIESEL', 256, 148);
      ctx.fillStyle = color; ctx.font = '700 84px monospace'; ctx.letterSpacing = '2px';
      ctx.shadowColor = color; ctx.shadowBlur = 26;
      ctx.fillText(price, 256, 232);
      ctx.shadowBlur = 0;
      totemTex.current.needsUpdate = true;
    }

    const dotP = ease(seg(p, 0.44, 0.58));
    if (dots.current) {
      dots.current.material.opacity = dotP;
      dots.current.visible = dotP > 0.01;
    }
  });

  useFrame(({ camera }) => {
    const p = progressRef.current;
    const K = [
      [0.0, [-16, 2.2, 22, -2, 1.6, 0]],    // low cinematic side view
      [0.13, [-9, 2.0, 15, -1, 1.4, 3]],    // rolling with the car
      [0.3, [1, 3, 18, 6, 2.4, 0]],         // pumps + totem + parked car
      [0.44, [2, 16, 26, 0, 0, -6]],        // rise: constellation reveals
      [0.62, [0, 46, 34, 0, 0, -30]],       // map flyover
      [1.0, [0, 70, 8, 0, 0, -50]],         // top-down dot field
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
      <fog attach="fog" args={['#04060A', 34, 150]} />
      <ambientLight intensity={0.32} />
      <hemisphereLight args={['#26344E', '#0A0D13', 0.55]} />
      <directionalLight position={[12, 18, 8]} intensity={0.45} color="#8FA3C8" />
      <Stars radius={200} depth={50} count={2200} factor={3.4} fade speed={0.35} />

      {/* Procedural env map: green canopy glow + cool sky panels → real paint reflections */}
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={0.25} color={GREEN} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 6, 1]} />
        <Lightformer intensity={0.9} color="#B7C6E4" position={[-10, 6, -8]} scale={[10, 6, 1]} />
        <Lightformer intensity={0.7} color="#5A6E96" position={[10, 8, 6]} scale={[12, 6, 1]} />
        <Lightformer intensity={0.5} color="#8FA3C8" position={[0, 10, -12]} scale={[16, 4, 1]} />
      </Environment>

      {/* Wet-asphalt reflective ground — the premium look */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[500, 500]} />
        <MeshReflectorMaterial
          blur={[300, 100]} resolution={1024} mixBlur={1} mixStrength={3.2}
          roughness={1} depthScale={1.1} minDepthThreshold={0.4} maxDepthThreshold={1.4}
          color="#0B0E15" metalness={0.35}
        />
      </mesh>

      {/* Station */}
      <group position={[8, 0, 0]}>
        <RoundedBox args={[13, 0.6, 8]} radius={0.12} position={[0, 6.2, 0]}>
          <meshStandardMaterial color="#131A28" metalness={0.3} roughness={0.5} />
        </RoundedBox>
        {/* neon trim: a thin band around the canopy PERIMETER (a full slab
            here turns the whole underside into a green ceiling — bad) */}
        {[
          { pos: [0, 5.86, 4.07], args: [13.18, 0.1, 0.14] },
          { pos: [0, 5.86, -4.07], args: [13.18, 0.1, 0.14] },
          { pos: [6.52, 5.86, 0], args: [0.14, 0.1, 8.14] },
          { pos: [-6.52, 5.86, 0], args: [0.14, 0.1, 8.14] },
        ].map((b, i) => (
          <mesh key={i} position={b.pos}>
            <boxGeometry args={b.args} />
            <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
        ))}
        {/* dark canopy underside */}
        <mesh position={[0, 5.89, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[12.9, 7.9]} />
          <meshStandardMaterial color="#0E1420" roughness={0.7} />
        </mesh>
        {[[-5.6, -3.1], [-5.6, 3.1], [5.6, -3.1], [5.6, 3.1]].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 3, z]}>
            <cylinderGeometry args={[0.2, 0.24, 6, 16]} />
            <meshStandardMaterial color="#1C2434" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
        {/* under-canopy light panels */}
        {[-3.4, 0, 3.4].map(x => (
          <mesh key={x} position={[x, 5.88, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.6, 0.45]} />
            <meshStandardMaterial color="#39445F" emissive="#DCE8E8" emissiveIntensity={1.1} />
          </mesh>
        ))}
        <pointLight position={[0, 4.9, 0]} intensity={65} color="#E8F0F6" distance={24} decay={1.9} />
        <Pump x={-2.4} />
        <Pump x={2.4} />
        {/* Totem with live LED texture */}
        <group position={[10.5, 0, 2.5]}>
          <mesh position={[0, 2.4, 0]}>
            <boxGeometry args={[0.34, 4.8, 0.34]} />
            <meshStandardMaterial color="#1C2434" metalness={0.5} roughness={0.4} />
          </mesh>
          <RoundedBox args={[3.3, 1.9, 0.42]} radius={0.08} position={[0, 5.5, 0]}>
            <meshStandardMaterial color="#0A0E16" metalness={0.3} roughness={0.5} />
          </RoundedBox>
          <mesh position={[0, 5.5, 0.22]}>
            <planeGeometry args={[3.05, 1.65]} />
            <meshBasicMaterial toneMapped={false}>
              {canvas && <canvasTexture ref={totemTex} attach="map" image={canvas} />}
            </meshBasicMaterial>
          </mesh>
        </group>
      </group>

      {/* The car */}
      <group ref={carRef} position={[-42, 0, 6.5]}>
        <primitive object={carModel} />
        <ContactShadows position={[0, 0.02, 0]} scale={9} blur={2.4} far={3} opacity={0.65} />
        <pointLight position={[2.7, 0.7, 0]} intensity={9} color="#F2ECCF" distance={11} decay={2} />
      </group>

      {/* Constellation / map dot field */}
      <points ref={dots} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={700} itemSize={3} array={dotPositions} />
          <bufferAttribute attach="attributes-color" count={700} itemSize={3} array={dotColors} />
        </bufferGeometry>
        <pointsMaterial size={2.6} vertexColors transparent opacity={0} sizeAttenuation
          map={spriteTex} alphaMap={spriteTex} depthWrite={false} toneMapped={false} />
      </points>

      <EffectComposer multisampling={2}>
        <Bloom intensity={0.7} luminanceThreshold={0.72} luminanceSmoothing={0.25} mipmapBlur />
        <Vignette eskil={false} offset={0.18} darkness={0.82} />
      </EffectComposer>
    </>
  );
}

export default function Landing3D() {
  const progressRef = useRef(0);

  function onCreated() {
    const update = () => {
      const b = document.body;
      progressRef.current = clamp01(b.scrollTop / Math.max(1, b.scrollHeight - window.innerHeight));
    };
    update();
    document.addEventListener('scroll', update, { capture: true, passive: true });
  }

  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 38, near: 0.5, far: 260 }} gl={{ antialias: true }} onCreated={onCreated}>
        <color attach="background" args={['#04060A']} />
        <Suspense fallback={null}>
          <Scene progressRef={progressRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload('/models/car.glb');
