import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, Color, MathUtils, Object3D, PerspectiveCamera, type AmbientLight, type DirectionalLight, type InstancedMesh } from 'three';
import type { Health, SceneFrame, Weather } from '../frame';
import Campus, { type Interaction, type Labels } from './Campus';

// The canvas: a bright studio-lit site with soft shadows. Sky and weather follow your company's
// year; a ghost company (holding course every year) can stand beside it.

const sky: Record<Health, string> = { thriving: '#dfe9f8', steady: '#e1e6ef', struggling: '#cfd3db', stalled: '#9aa1ad' };
const weatherSky: Partial<Record<Weather, string>> = { storm: '#8c939f', rain: '#c7ccd5', haze: '#f1e2c8', boom: '#e3efff' };
const rainFor: Record<Weather, number> = { clear: 0, boom: 0, haze: 0, rain: .6, storm: 1 };
const GHOST_X = 40;

function Atmosphere({ frame, reduced, offset }: { frame: SceneFrame; reduced: boolean; offset: number }) {
  const scene = useThree(s => s.scene), invalidate = useThree(s => s.invalidate);
  const bg = useMemo(() => new Color(sky.steady), []), goal = useMemo(() => new Color(), []);
  const sun = useRef<DirectionalLight>(null), amb = useRef<AmbientLight>(null), rain = useRef<InstancedMesh>(null), smoke = useRef<InstancedMesh>(null);
  const level = useRef({ rain: 0, smoke: 0, sun: 2.7 }), dummy = useMemo(() => new Object3D(), []);
  const DROPS = 700, PUFFS = 16;
  useEffect(() => { scene.background = bg; invalidate(); }, [scene, bg, frame, invalidate]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, step = Math.min(dt, .1), w = frame.weather;
    goal.set(weatherSky[w] ?? sky[frame.health]);
    if (reduced) bg.copy(goal); else bg.lerp(goal, 1 - Math.exp(-2 * step));
    if (scene.fog) (scene.fog as unknown as { color: Color }).color.copy(bg);
    const L = level.current, target = { rain: rainFor[w], smoke: frame.health === 'stalled' ? 1 : frame.health === 'struggling' ? .35 : 0, sun: w === 'boom' ? 3.2 : frame.health === 'thriving' ? 3 : frame.health === 'stalled' ? 1.2 : w === 'storm' ? 1 : 2.7 };
    for (const k of ['rain', 'smoke', 'sun'] as const) L[k] = reduced ? target[k] : MathUtils.damp(L[k], target[k], 1.8, step);
    // A storm brings lightning: brief flashes.
    const flash = w === 'storm' && !reduced && Math.sin(t * 1.7) > .97 ? 2.5 : 0;
    if (sun.current) sun.current.intensity = L.sun;
    if (amb.current) amb.current.intensity = .08 + flash;
    const r = rain.current;
    if (r) {
      for (let i = 0; i < DROPS; i++) {
        const x = (Math.sin(i * 91.7) * .5 + .5) * 70 - 35 + offset, z = (Math.sin(i * 47.3) * .5 + .5) * 36 - 14, y = 24 - ((t * 16 + i * 1.37) % 24);
        dummy.position.set(x, y, z); dummy.scale.setScalar(i / DROPS < L.rain - .01 ? 1 : 0); dummy.updateMatrix(); r.setMatrixAt(i, dummy.matrix);
      }
      r.instanceMatrix.needsUpdate = true;
    }
    // Smoke rises from the office roof of a stalled or struggling business.
    const s = smoke.current;
    if (s) {
      for (let i = 0; i < PUFFS; i++) {
        const u = (t * .1 + i / PUFFS) % 1, k = i / PUFFS < L.smoke - .02 ? 1 : 0;
        dummy.position.set(offset - 8.3 + Math.sin(i) * .6 + u * 2, frame.floors * .62 + 1.4 + u * 7, -2.4 + Math.cos(i) * .5); dummy.scale.setScalar(Math.max(.001, k * (.5 + u * 1.6))); dummy.updateMatrix(); s.setMatrixAt(i, dummy.matrix);
      }
      s.instanceMatrix.needsUpdate = true;
    }
  });
  return <>
    <fog attach="fog" args={[sky.steady, 150, 320]} />
    <ambientLight ref={amb} intensity={.08} />
    <directionalLight ref={sun} position={[18, 32, 22]} intensity={2.7} color="#fff6e8" castShadow
      shadow-mapSize={[2048, 2048]} shadow-bias={-.0004} shadow-normalBias={.04} shadow-radius={6}
      shadow-camera-left={-40} shadow-camera-right={70} shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-far={120} />
    {/* A soft studio environment, built in place so the site needs no image downloads. */}
    <Environment resolution={256} environmentIntensity={.28}>
      <Lightformer form="rect" intensity={2.2} position={[0, 12, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[40, 40, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={1.2} position={[-20, 6, 10]} rotation={[0, Math.PI / 3, 0]} scale={[20, 8, 1]} color="#dfe9ff" />
      <Lightformer form="rect" intensity={1} position={[20, 6, 10]} rotation={[0, -Math.PI / 3, 0]} scale={[20, 8, 1]} color="#fff3e0" />
      <Lightformer form="ring" intensity={.8} position={[0, 4, -20]} scale={10} color="#ffffff" />
    </Environment>
    <instancedMesh ref={rain} args={[undefined, undefined, DROPS]} frustumCulled={false}><boxGeometry args={[.025, .55, .025]} /><meshBasicMaterial color="#9fb3cc" transparent opacity={.5} /></instancedMesh>
    <instancedMesh ref={smoke} args={[undefined, undefined, PUFFS]} frustumCulled={false}><sphereGeometry args={[.6, 14, 10]} /><meshStandardMaterial color="#3a3e45" transparent opacity={.5} depthWrite={false} roughness={1} /></instancedMesh>
  </>;
}

/** Frames the site (or both sites). Narrow phone screens look down more steeply and step back a little, so the
 * site fills the frame instead of the sky. */
function CameraRig({ wide, reset }: { wide: boolean; reset: number }) {
  const camera = useThree(s => s.camera), aspect = useThree(s => s.size.width / Math.max(1, s.size.height)), controls = useThree(s => s.controls) as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  useEffect(() => {
    const narrow = Math.max(1, (wide ? 2.1 : 1.45) / aspect), grow = Math.sqrt(narrow);
    const target = wide ? [GHOST_X / 2, 1.5, 1.5] : [1.5, 1.5, 2.5];
    const distance = (wide ? 104 : 69) * grow, polar = (narrow > 1.2 ? 44 : 60) * Math.PI / 180, azimuth = wide ? .12 : .63;
    camera.position.set(target[0] + distance * Math.sin(polar) * Math.sin(azimuth), target[1] + distance * Math.cos(polar), target[2] + distance * Math.sin(polar) * Math.cos(azimuth));
    if (camera instanceof PerspectiveCamera) { camera.fov = Math.min(60, 26 * grow); camera.updateProjectionMatrix(); }
    controls?.target.set(target[0], target[1], target[2]); controls?.update();
  }, [wide, camera, controls, aspect, reset]);
  return null;
}

export interface SceneProps { you: SceneFrame; ghost?: SceneFrame; labels?: Labels; interaction?: Interaction; reduced: boolean; youTitle?: string; reset?: number }
export default function LiveScene({ you, ghost, labels, interaction, reduced, youTitle, reset = 0 }: SceneProps) {
  const wide = !!ghost;
  return <Canvas shadows dpr={[1, 2]} frameloop={reduced ? 'demand' : 'always'} gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: .9 }}
    camera={{ position: [40, 40, 56], fov: 26, near: 1, far: 400 }} aria-hidden="true" onPointerMissed={() => interaction?.hover?.(null)}>
    <Atmosphere frame={you} reduced={reduced} offset={0} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[GHOST_X / 2, -.05, 0]} receiveShadow><planeGeometry args={[400, 400]} /><meshStandardMaterial color="#dde3ed" roughness={1} /></mesh>
    <Campus frame={you} labels={labels} interaction={interaction} reduced={reduced} title={youTitle} />
    {ghost && <Campus frame={ghost} ghost reduced={reduced} position={[GHOST_X, 0, 0]} title="HOLDING COURSE" />}
    <OrbitControls makeDefault enableDamping enablePan={false} minDistance={20} maxDistance={220} maxPolarAngle={1.3} minPolarAngle={.35} target={[0, 1.5, 1.5]} />
    <CameraRig wide={wide} reset={reset} />
  </Canvas>;
}
