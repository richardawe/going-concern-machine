import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Color, MathUtils, Object3D, PerspectiveCamera, type AmbientLight, type DirectionalLight, type InstancedMesh } from 'three';
import type { Health, SceneFrame, Weather } from '../frame';
import Campus, { type Labels, type Pick } from './Campus';

// The canvas: sky and weather follow your company's year; a ghost company (holding course every year) can stand beside it.

const sky: Record<Health, string> = { thriving: '#bfe0fb', steady: '#d5dde6', struggling: '#a9b0b8', stalled: '#5a5f68' };
const weatherSky: Partial<Record<Weather, string>> = { storm: '#474d57', rain: '#8e979f', haze: '#d8bd92', boom: '#cdeaff' };
const rainFor: Record<Weather, number> = { clear: 0, boom: 0, haze: 0, rain: .6, storm: 1 };

function Atmosphere({ frame, reduced, offset }: { frame: SceneFrame; reduced: boolean; offset: number }) {
  const scene = useThree(s => s.scene), invalidate = useThree(s => s.invalidate);
  const bg = useMemo(() => new Color(sky.steady), []), goal = useMemo(() => new Color(), []);
  const sun = useRef<DirectionalLight>(null), amb = useRef<AmbientLight>(null), rain = useRef<InstancedMesh>(null), smoke = useRef<InstancedMesh>(null);
  const level = useRef({ rain: 0, smoke: 0, sun: 1.6 }), dummy = useMemo(() => new Object3D(), []);
  const DROPS = 500, PUFFS = 14;
  useEffect(() => { scene.background = bg; invalidate(); }, [scene, bg, frame, invalidate]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, step = Math.min(dt, .1), w = frame.weather;
    goal.set(weatherSky[w] ?? sky[frame.health]);
    if (reduced) bg.copy(goal); else bg.lerp(goal, 1 - Math.exp(-2 * step));
    if (scene.fog) (scene.fog as unknown as { color: Color }).color.copy(bg);
    const L = level.current, target = { rain: rainFor[w], smoke: frame.health === 'stalled' ? 1 : frame.health === 'struggling' ? .35 : 0, sun: w === 'boom' ? 2.4 : frame.health === 'thriving' ? 2 : frame.health === 'stalled' ? .7 : w === 'storm' ? .6 : 1.4 };
    for (const k of ['rain', 'smoke', 'sun'] as const) L[k] = reduced ? target[k] : MathUtils.damp(L[k], target[k], 1.8, step);
    // A storm brings lightning: brief flashes on a seeded rhythm.
    const flash = w === 'storm' && !reduced && Math.sin(t * 1.7) > .97 ? 2.5 : 0;
    if (sun.current) sun.current.intensity = L.sun;
    if (amb.current) amb.current.intensity = .55 + flash;
    const r = rain.current;
    if (r) {
      for (let i = 0; i < DROPS; i++) {
        const x = (Math.sin(i * 91.7) * .5 + .5) * 60 - 30, z = (Math.sin(i * 47.3) * .5 + .5) * 34 - 14, y = 22 - ((t * 14 + i * 1.37) % 22);
        dummy.position.set(x, y, z); dummy.scale.set(1, 1, 1).multiplyScalar(i / DROPS < L.rain - .01 ? 1 : 0); dummy.updateMatrix(); r.setMatrixAt(i, dummy.matrix);
      }
      r.instanceMatrix.needsUpdate = true;
    }
    // Smoke rises from the roof of a stalled or struggling business.
    const s = smoke.current;
    if (s) {
      for (let i = 0; i < PUFFS; i++) {
        const u = (t * .12 + i / PUFFS) % 1, k = i / PUFFS < L.smoke - .02 ? 1 : 0;
        dummy.position.set(offset + Math.sin(i) * .6 + u * 1.5, frame.floors * .62 + 1.2 + u * 6, Math.cos(i) * .5); dummy.scale.setScalar(k * (.5 + u * 1.4)); dummy.updateMatrix(); s.setMatrixAt(i, dummy.matrix);
      }
      s.instanceMatrix.needsUpdate = true;
    }
  });
  return <>
    <fog attach="fog" args={[sky.steady, 45, 110]} />
    <ambientLight ref={amb} intensity={.55} />
    <hemisphereLight args={['#ffffff', '#8a8f86', .6]} />
    <directionalLight ref={sun} position={[12, 20, 10]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={20} shadow-camera-bottom={-20} />
    <instancedMesh ref={rain} args={[undefined, undefined, DROPS]} frustumCulled={false}><boxGeometry args={[.02, .5, .02]} /><meshBasicMaterial color="#c8d6e5" transparent opacity={.55} /></instancedMesh>
    <instancedMesh ref={smoke} args={[undefined, undefined, PUFFS]} frustumCulled={false}><sphereGeometry args={[.5, 10, 8]} /><meshStandardMaterial color="#2f3236" transparent opacity={.45} depthWrite={false} /></instancedMesh>
  </>;
}

/** Moves the camera when the ghost company appears or leaves, so both campuses stay in view. */
function CameraRig({ wide }: { wide: boolean }) {
  const camera = useThree(s => s.camera), aspect = useThree(s => s.size.width / Math.max(1, s.size.height)), controls = useThree(s => s.controls) as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  useEffect(() => {
    if (wide) camera.position.set(0, 20, 40); else camera.position.set(17, 12, 21);
    // Narrow (phone) screens widen the lens rather than step back into the fog, so the whole site still fits.
    if (camera instanceof PerspectiveCamera) { camera.fov = Math.min(78, 40 * Math.max(1, (wide ? 1.9 : 1.3) / aspect)); camera.updateProjectionMatrix(); }
    controls?.target.set(0, 2.5, wide ? 1 : 1.5); controls?.update();
  }, [wide, camera, controls, aspect]);
  return null;
}

export interface SceneProps { you: SceneFrame; ghost?: SceneFrame; labels?: Labels; pick?: Pick; reduced: boolean; youTitle?: string }
export default function LiveScene({ you, ghost, labels, pick, reduced, youTitle }: SceneProps) {
  const wide = !!ghost;
  return <Canvas shadows dpr={[1, 2]} frameloop={reduced ? 'demand' : 'always'} camera={{ position: [17, 12, 21], fov: 40, near: .5, far: 300 }} aria-hidden="true">
    <Atmosphere frame={you} reduced={reduced} offset={wide ? -14 : 0} />
    <Campus frame={you} labels={labels} pick={pick} reduced={reduced} position={wide ? [-14, 0, 0] : [0, 0, 0]} title={youTitle} />
    {ghost && <Campus frame={ghost} ghost reduced={reduced} position={[14, 0, 0]} title="HOLDING COURSE" />}
    <ContactShadows position={[0, .02, 0]} scale={wide ? 80 : 40} blur={2.4} far={12} opacity={.35} frames={reduced ? 1 : Infinity} />
    <OrbitControls makeDefault enableDamping enablePan={false} minDistance={12} maxDistance={120} maxPolarAngle={1.38} target={[0, 2.5, 1.5]} />
    <CameraRig wide={wide} />
  </Canvas>;
}
