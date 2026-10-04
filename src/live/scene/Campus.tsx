import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { CanvasTexture, Color, CurvePath, LineCurve3, MathUtils, Object3D, QuadraticBezierCurve3, RepeatWrapping, SRGBColorSpace, Vector3, type Group, type InstancedMesh, type Mesh, type MeshStandardMaterial, type PointLight } from 'three';
import type { Health, SceneFrame } from '../frame';
import { Fence, Forklift, Mat, Pallet, Pin, RBox, Tree, Truck, palette } from './props';

// One company site, drawn as a clean logistics campus. Every moving part reads `live`, a damped copy of the target
// SceneFrame, so a new year eases in over about two seconds instead of jumping. Nothing here invents a number: see
// frame.ts for what drives what.

type Numeric = Omit<SceneFrame, 'weather' | 'health' | 'alarm' | 'year'> & { alarm: number };
export type Live = MutableRefObject<Numeric>;
export interface Labels { revenue: string; momentum: string; cash: string; debt: string; staff: string; customers: string }
export type Part = 'revenue' | 'businessMomentum' | 'cash' | 'debt' | 'staff' | 'customers';
export interface Interaction { pick?: (metric: Part) => void; hover?: (metric: Part | null) => void; hovered?: Part | null }

const hash = (i: number, k = 0) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const numeric = (f: SceneFrame): Numeric => ({ floors: f.floors, lit: f.lit, spin: f.spin, wobble: f.wobble, cashLevel: f.cashLevel, cashFlow: f.cashFlow, debtWeights: f.debtWeights, alarm: f.alarm ? 1 : 0, staff: f.staff, morale: f.morale, leaving: f.leaving, arrivals: f.arrivals, churn: f.churn, cranes: f.cranes });
export const healthColor: Record<Health, string> = { thriving: '#22b46b', steady: '#1f5eff', struggling: '#f0a020', stalled: '#e5483b' };

// Site plan (metres). The warehouse faces the yard (+z); the road runs along the front.
const WH = { x0: -6.2, x1: 8.2, z0: -5, z1: 1, h: 3.4 };
const BAYS = 6, bayX = (i: number) => -4.4 + i * 2.3;
const TOWER = { x: -8.3, z: -2.4, w: 3.4, d: 3.4, floor: .62, max: 20 };
const ROAD_Z = 10.3, YARD_Z = 6.9, FENCE_Z = 8.6, ENTRY_X = -5.3, EXIT_X = 8.6;
const FLYWHEEL: [number, number, number] = [-14.5, 0, -.5], SILO: [number, number, number] = [13, 0, -2.4], GANTRY: [number, number, number] = [11.2, 0, 3.4];

/** Click and hover affordance for the parts that open the inspector. */
function interactive(i: Interaction, part: Part) {
  if (!i.pick) return {};
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); i.pick!(part); },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; i.hover?.(part); },
    onPointerOut: () => { document.body.style.cursor = ''; i.hover?.(null); },
  };
}
function Tag({ position, children, active }: { position: [number, number, number]; children: ReactNode; active?: boolean }) {
  return <Html position={position} center distanceFactor={34} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}><div className={`live-tag${active ? ' active' : ''}`}>{children}</div></Html>;
}

/** Eases `live` towards the target frame. Rendered first in the campus so every part reads this frame's values. */
function Driver({ live, target, reduced }: { live: Live; target: SceneFrame; reduced: boolean }) {
  const goal = useMemo(() => numeric(target), [target]);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => { invalidate(); }, [goal, invalidate]);
  useFrame((_, dt) => {
    const cur = live.current;
    for (const k of Object.keys(goal) as (keyof Numeric)[]) cur[k] = reduced ? goal[k] : MathUtils.damp(cur[k], goal[k], 2.2, Math.min(dt, .1));
  });
  return null;
}

/** Light corrugated cladding, drawn once into a canvas. */
function useCladding() {
  return useMemo(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8;
    const g = c.getContext('2d')!; g.fillStyle = '#eef1f6'; g.fillRect(0, 0, 64, 8);
    for (let x = 0; x < 64; x += 8) { g.fillStyle = '#d9dee8'; g.fillRect(x, 0, 2, 8); g.fillStyle = '#f8f9fc'; g.fillRect(x + 3, 0, 2, 8); }
    const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
  }, []);
}

function Ground({ ghost }: { ghost?: boolean }) {
  const dashes = useMemo(() => Array.from({ length: 22 }, (_, i) => -33 + i * 3.1), []);
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.02, 0]} receiveShadow><planeGeometry args={[36, 30]} /><Mat color={palette.ground} rough={.95} ghost={ghost} /></mesh>
    {/* Yard apron in front of the docks, with parking and bay lines in safety yellow. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .002, 4.8]} receiveShadow><planeGeometry args={[23, 7.6]} /><Mat color={palette.yard} rough={.9} ghost={ghost} /></mesh>
    {Array.from({ length: BAYS + 1 }, (_, i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[bayX(i) - 1.15, .006, 3]}><planeGeometry args={[.07, 4]} /><meshBasicMaterial color={palette.line} transparent opacity={ghost ? .3 : 1} /></mesh>)}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.35, .006, 5]}><planeGeometry args={[BAYS * 2.3, .07]} /><meshBasicMaterial color={palette.line} transparent opacity={ghost ? .3 : 1} /></mesh>
    {[0, 1, 2].map(i => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-9.6, .006, 2.6 + i * 1.6]}><planeGeometry args={[2.4, 1.3]} /><meshBasicMaterial color={palette.line} transparent opacity={ghost ? .15 : .55} /></mesh>)}
    {/* Road with lane markings, and the drives through the two gates. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .003, 11]} receiveShadow><planeGeometry args={[70, 3.4]} /><Mat color={palette.road} rough={.95} ghost={ghost} /></mesh>
    {dashes.map(x => <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, .008, 11]}><planeGeometry args={[1.5, .1]} /><meshBasicMaterial color={palette.lane} transparent opacity={ghost ? .3 : 1} /></mesh>)}
    {[ENTRY_X, EXIT_X].map(x => <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, .004, 8.4]} receiveShadow><planeGeometry args={[2.6, 2.6]} /><Mat color={palette.road} rough={.95} ghost={ghost} /></mesh>)}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .004, 12.85]}><planeGeometry args={[70, .3]} /><Mat color="#cfe8d8" ghost={ghost} /></mesh>
    <Fence x0={-17} x1={16.5} z={FENCE_Z} gates={[[ENTRY_X - 1.4, ENTRY_X + 1.4], [EXIT_X - 1.4, EXIT_X + 1.4]]} ghost={ghost} />
    {[-16, -12.5, -9, 0, 3.5, 12, 15].map((x, i) => <Tree key={x} position={[x + hash(i, 4) * .6, 0, FENCE_Z + .5]} scale={.85 + hash(i, 5) * .35} ghost={ghost} />)}
    {[-15.5, -11, -3, 4, 10, 15.5].map((x, i) => <Tree key={`b${x}`} position={[x, 0, -9 - hash(i, 6) * 1.5]} scale={1 + hash(i, 7) * .4} ghost={ghost} />)}
    {[[-10.4, 2.7], [-9.6, 2.7], [-8.8, 2.7], [-10.4, 4.3], [-9.6, 4.3], [-10.4, 5.9]].map(([x, z], i) => <Pallet key={i} position={[x, 0, z]} ghost={ghost} wrap={i % 3 === 2 ? '#2f6bff' : undefined} />)}
  </group>;
}

function Warehouse({ live, ghost, health }: { live: Live; ghost?: boolean; health: Health }) {
  const cladding = useCladding(), doors = useRef<(Mesh | null)[]>([]), glows = useRef<(MeshStandardMaterial | null)[]>([]);
  const len = WH.x1 - WH.x0, depth = WH.z1 - WH.z0, front = useMemo(() => { const t = cladding.clone(); t.repeat.set(len * 1.2, 1); t.needsUpdate = true; return t; }, [cladding, len]);
  useFrame(() => {
    // Busy bays (customer activity) have their doors raised and lights on.
    const active = MathUtils.clamp(live.current.arrivals * 2.5, 0, BAYS);
    for (let i = 0; i < BAYS; i++) {
      const open = MathUtils.clamp(active - i, 0, 1);
      const d = doors.current[i]; if (d) { d.scale.y = 1 - .72 * open; d.position.y = 1.15 + 1.1 * (1 - d.scale.y); }
      const g = glows.current[i]; if (g) g.emissiveIntensity = .15 + 1.4 * open;
    }
  });
  return <group>
    <mesh position={[(WH.x0 + WH.x1) / 2, WH.h / 2, (WH.z0 + WH.z1) / 2]} castShadow receiveShadow>
      <boxGeometry args={[len, WH.h, depth]} />
      <meshStandardMaterial map={front} color="#ffffff" roughness={.6} transparent={ghost} opacity={ghost ? .3 : 1} depthWrite={!ghost} />
    </mesh>
    <RBox size={[len + .3, .22, depth + .3]} r={.05} color={palette.white} position={[(WH.x0 + WH.x1) / 2, WH.h + .1, (WH.z0 + WH.z1) / 2]} ghost={ghost} />
    {/* Royal-blue fascia and corner trims, as on a modern distribution centre. */}
    <RBox size={[len + .34, .3, .1]} r={.03} color={palette.blue} position={[(WH.x0 + WH.x1) / 2, WH.h - .05, WH.z1 + .12]} ghost={ghost} />
    {[WH.x0, WH.x1].map(x => <RBox key={x} size={[.18, WH.h, .18]} r={.04} color={palette.blue} position={[x, WH.h / 2, WH.z1 + .03]} ghost={ghost} />)}
    {[[-2, -3], [3, -1.6], [6, -3.6]].map(([x, z], i) => <group key={i} position={[x, WH.h + .2, z]}>
      <RBox size={[1.1, .45, .8]} r={.08} color={palette.panel} ghost={ghost} />
      <mesh position={[0, .25, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[.28, 20]} /><Mat color={palette.grey} ghost={ghost} /></mesh>
    </group>)}
    {Array.from({ length: BAYS }, (_, i) => <group key={i} position={[bayX(i), 0, WH.z1]}>
      <RBox size={[1.9, 2.55, .16]} r={.05} color={palette.navy} position={[0, 1.27, .06]} ghost={ghost} />
      <mesh position={[0, 1.15, .1]}><planeGeometry args={[1.5, 2.1]} /><meshStandardMaterial ref={m => { glows.current[i] = m; }} color="#3a3f4b" emissive="#ffcf7a" emissiveIntensity={.15} transparent={ghost} opacity={ghost ? .3 : 1} /></mesh>
      <mesh ref={m => { doors.current[i] = m; }} position={[0, 1.15, .16]} castShadow><boxGeometry args={[1.5, 2.1, .05]} /><meshStandardMaterial color="#f2f4f8" roughness={.5} transparent={ghost} opacity={ghost ? .3 : 1} /></mesh>
      <RBox size={[2.1, .35, .9]} r={.05} color={palette.wall} position={[0, .17, .5]} ghost={ghost} />
      {[-.6, .6].map(x => <RBox key={x} size={[.2, .3, .14]} r={.04} color={palette.dark} position={[x, .55, .98]} ghost={ghost} />)}
      <mesh position={[.95, 2.75, .2]}><sphereGeometry args={[.08, 12, 10]} /><meshStandardMaterial color={healthColor[health]} emissive={healthColor[health]} emissiveIntensity={1.4} toneMapped={false} /></mesh>
    </group>)}
    <Html position={[WH.x0 + 3.6, WH.h - .55, WH.z1 + .25]} transform distanceFactor={4.2} occlude={false} style={{ pointerEvents: 'none' }}><div className="live-wall-sign">GOING CONCERN · DC‑01</div></Html>
  </group>;
}

/** The office tower: one storey per sixth of starting revenue. Lit windows follow productivity. */
function Tower({ live, ghost, health, i }: { live: Live; ghost?: boolean; health: Health; i: Interaction }) {
  const floors = useRef<(Group | null)[]>([]), glass = useRef<(MeshStandardMaterial | null)[]>([]), cap = useRef<Group>(null);
  const beacon = useRef<MeshStandardMaterial>(null), glow = useRef<PointLight>(null);
  useFrame(({ clock }) => {
    const f = live.current.floors;
    floors.current.forEach((g, n) => { if (!g) return; const s = MathUtils.clamp(f - n, 0, 1); g.scale.y = Math.max(.001, s); g.visible = s > .002; });
    glass.current.forEach((m, n) => { if (m) m.emissiveIntensity = hash(n, 3) < live.current.lit ? .35 : 0; });
    if (cap.current) cap.current.position.y = f * TOWER.floor + .3;
    const flash = live.current.alarm * (Math.sin(clock.elapsedTime * 9) > 0 ? 1 : .15);
    if (beacon.current) beacon.current.emissiveIntensity = .3 + 4 * flash;
    if (glow.current) glow.current.intensity = 30 * flash;
  });
  return <group position={[TOWER.x, 0, TOWER.z]} {...interactive(i, 'revenue')}>
    <RBox size={[TOWER.w + .5, .3, TOWER.d + .5]} r={.06} color={palette.white} position={[0, .15, 0]} ghost={ghost} />
    {Array.from({ length: TOWER.max }, (_, n) => <group key={n} ref={g => { floors.current[n] = g; }} position={[0, .3 + n * TOWER.floor, 0]}>
      <mesh position={[0, TOWER.floor * .5, 0]} castShadow receiveShadow>
        <boxGeometry args={[TOWER.w - .08, TOWER.floor * .9, TOWER.d - .08]} />
        <meshStandardMaterial ref={m => { glass.current[n] = m; }} color={palette.glass} roughness={.05} metalness={.7} emissive="#fff1c9" emissiveIntensity={0} transparent={ghost} opacity={ghost ? .3 : 1} />
      </mesh>
      <mesh position={[0, TOWER.floor * .96, 0]} castShadow><boxGeometry args={[TOWER.w, TOWER.floor * .08, TOWER.d]} /><Mat color={palette.white} ghost={ghost} /></mesh>
    </group>)}
    <group ref={cap}>
      <RBox size={[TOWER.w + .1, .25, TOWER.d + .1]} r={.06} color={palette.white} ghost={ghost} />
      <RBox size={[1.2, .5, 1]} r={.08} color={palette.panel} position={[-.7, .35, -.6]} ghost={ghost} />
      <mesh position={[.9, .65, .9]}><cylinderGeometry args={[.035, .035, 1.1]} /><Mat color={palette.dark} ghost={ghost} /></mesh>
      <mesh position={[.9, 1.25, .9]}><sphereGeometry args={[.13, 16, 12]} /><meshStandardMaterial ref={beacon} color="#7a1d14" emissive="#ff2d1a" emissiveIntensity={.3} toneMapped={false} /></mesh>
      {!ghost && <pointLight ref={glow} position={[.9, 1.5, .9]} color="#ff3b28" intensity={0} distance={18} />}
      {/* A flag in the health colour: green thriving, blue steady, amber struggling, red stalled. */}
      <mesh position={[-.9, 1, .9]}><cylinderGeometry args={[.025, .025, 1.6]} /><Mat color={palette.grey} ghost={ghost} /></mesh>
      <RBox size={[.75, .42, .03]} r={.01} color={healthColor[health]} position={[-.5, 1.55, .9]} ghost={ghost} />
    </group>
  </group>;
}

function Flywheel({ live, ghost, i }: { live: Live; ghost?: boolean; i: Interaction }) {
  const wheel = useRef<Group>(null), mount = useRef<Group>(null);
  useFrame(({ clock }, dt) => {
    const { spin, wobble } = live.current, t = clock.elapsedTime;
    if (wheel.current) wheel.current.rotation.z -= spin * Math.min(dt, .1);
    if (mount.current) { mount.current.rotation.x = Math.sin(t * 7.3) * wobble * .14; mount.current.rotation.y = Math.cos(t * 5.1) * wobble * .1; }
  });
  return <group position={FLYWHEEL} {...interactive(i, 'businessMomentum')}>
    <RBox size={[5.2, .35, 3]} r={.1} color={palette.white} position={[0, .17, 0]} ghost={ghost} />
    {[-.75, .75].map(z => <RBox key={z} size={[.7, 2.9, .35]} r={.08} color={palette.navy} position={[0, 1.75, z]} ghost={ghost} />)}
    <group ref={mount} position={[0, 3, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.12, .12, 1.9, 16]} /><Mat color={palette.grey} metal={.9} rough={.25} ghost={ghost} /></mesh>
      <group ref={wheel}>
        <mesh castShadow><torusGeometry args={[2.1, .32, 24, 64]} /><Mat color="#c9ced6" metal={.95} rough={.18} ghost={ghost} /></mesh>
        <mesh><torusGeometry args={[1.72, .08, 12, 64]} /><Mat color={palette.blue} metal={.5} rough={.3} ghost={ghost} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.5, .5, .75, 32]} /><Mat color={palette.blue} metal={.4} rough={.25} ghost={ghost} /></mesh>
        {Array.from({ length: 6 }, (_, k) => <mesh key={k} rotation={[0, 0, k * Math.PI / 3]} position={[Math.cos(k * Math.PI / 3) * 1.1, Math.sin(k * Math.PI / 3) * 1.1, 0]} castShadow><boxGeometry args={[1.5, .2, .18]} /><Mat color="#b7bdc7" metal={.9} rough={.22} ghost={ghost} /></mesh>)}
        <RBox size={[.36, .5, .2]} r={.06} color={palette.yellow} position={[0, 2.1, .3]} ghost={ghost} />
      </group>
    </group>
  </group>;
}

function CashSilo({ live, ghost, i }: { live: Live; ghost?: boolean; i: Interaction }) {
  const H = 5, liquid = useRef<Mesh>(null), drops = useRef<InstancedMesh>(null), dummy = useMemo(() => new Object3D(), []);
  const plus = useMemo(() => new Color(palette.amber), []), minus = useMemo(() => new Color(palette.red), []);
  const N = 12, from = WH.x1, to = SILO[0] - 1.7, y = 1.4, z = SILO[2];
  useFrame(({ clock }) => {
    const { cashLevel, cashFlow } = live.current, level = Math.max(.002, cashLevel);
    if (liquid.current) { liquid.current.scale.y = level * H; liquid.current.position.y = .45 + level * H / 2; }
    const d = drops.current; if (!d) return;
    const speed = .15 + Math.abs(cashFlow) * 1.2, show = Math.abs(cashFlow) > .02;
    for (let k = 0; k < N; k++) {
      const u = (clock.elapsedTime * speed + k / N) % 1, along = cashFlow >= 0 ? u : 1 - u;
      dummy.position.set(from + (to - from) * along, y, z); dummy.scale.setScalar(show ? .8 + .4 * Math.abs(cashFlow) : 0); dummy.updateMatrix();
      d.setMatrixAt(k, dummy.matrix); d.setColorAt(k, cashFlow >= 0 ? plus : minus);
    }
    d.instanceMatrix.needsUpdate = true; if (d.instanceColor) d.instanceColor.needsUpdate = true;
  });
  return <group>
    {/* Pipe from the business to the reserve: amber flows in with positive free cash flow, red drains out with negative. */}
    <mesh position={[(from + to) / 2, y, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.22, .22, to - from, 20, 1, true]} /><meshPhysicalMaterial color="#dff0ff" transmission={ghost ? 0 : .9} roughness={.05} thickness={.2} transparent opacity={ghost ? .1 : .5} depthWrite={false} /></mesh>
    {[from + .3, to - .2].map(x => <mesh key={x} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.28, .28, .16, 20]} /><Mat color={palette.grey} metal={.8} rough={.3} ghost={ghost} /></mesh>)}
    <instancedMesh ref={drops} args={[undefined, undefined, N]} frustumCulled={false}><sphereGeometry args={[.14, 12, 10]} /><meshStandardMaterial emissive="#ff9d00" emissiveIntensity={.6} toneMapped={false} transparent={ghost} opacity={ghost ? .3 : 1} /></instancedMesh>
    <group position={SILO} {...interactive(i, 'cash')}>
      <RBox size={[3.8, .45, 3.8]} r={.12} color={palette.white} position={[0, .22, 0]} ghost={ghost} />
      <mesh position={[0, .45 + H / 2, 0]}><cylinderGeometry args={[1.6, 1.6, H, 48, 1, true]} /><meshPhysicalMaterial color="#eaf5ff" transmission={ghost ? 0 : 1} roughness={.04} thickness={.4} ior={1.3} transparent opacity={ghost ? .1 : .35} depthWrite={false} /></mesh>
      <mesh ref={liquid} castShadow><cylinderGeometry args={[1.5, 1.5, 1, 48]} /><meshStandardMaterial color={palette.amber} emissive="#ff9d00" emissiveIntensity={.35} roughness={.25} transparent opacity={ghost ? .3 : .95} /></mesh>
      {[.5, .45 + H / 2, .45 + H].map(h => <mesh key={h} position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.62, .07, 10, 48]} /><Mat color={palette.blue} metal={.4} rough={.3} ghost={ghost} /></mesh>)}
      <mesh position={[0, .5 + H, 0]}><cylinderGeometry args={[1.62, 1.62, .1, 48]} /><Mat color={palette.white} ghost={ghost} /></mesh>
    </group>
  </group>;
}

function Debt({ live, ghost, i }: { live: Live; ghost?: boolean; i: Interaction }) {
  const weights = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    const d = live.current.debtWeights;
    weights.current.forEach((g, k) => { if (!g) return; const s = MathUtils.clamp(d - k, 0, 1); g.scale.setScalar(Math.max(.001, s)); g.visible = s > .002; g.rotation.z = Math.sin(clock.elapsedTime * 1.3 + k) * .04 * s; });
  });
  // A hoist gantry: each red weight is debt worth 10% of Year 0 revenue.
  return <group position={GANTRY} {...interactive(i, 'debt')}>
    {[-.3, 3.6].map(x => <RBox key={x} size={[.26, 4.8, .26]} r={.06} color={palette.dark} position={[x, 2.4, 0]} ghost={ghost} />)}
    <RBox size={[4.3, .3, .4]} r={.06} color={palette.dark} position={[1.65, 4.8, 0]} ghost={ghost} />
    {Array.from({ length: 12 }, (_, k) => <group key={k} ref={g => { weights.current[k] = g; }} position={[(k % 6) * .6 + .15, 4.65, k < 6 ? .12 : -.12]}>
      <mesh position={[0, -.6 - (k >= 6 ? .9 : 0), 0]}><cylinderGeometry args={[.025, .025, 1.2 + (k >= 6 ? 1.8 : 0)]} /><Mat color={palette.dark} ghost={ghost} /></mesh>
      <RBox size={[.46, .52, .46]} r={.08} color={palette.red} rough={.35} position={[0, -1.4 - (k >= 6 ? 1.8 : 0), 0]} ghost={ghost} />
    </group>)}
  </group>;
}

function Cranes({ live, ghost }: { live: Live; ghost?: boolean }) {
  const cranes = useRef<(Group | null)[]>([]), jibs = useRef<(Group | null)[]>([]);
  const spots: [number, number][] = [[-2.5, -7.5], [5.5, -7.2], [-12.5, -5.5]];
  useFrame(({ clock }) => {
    const c = live.current.cranes;
    cranes.current.forEach((g, k) => { if (!g) return; const s = MathUtils.clamp(c - k, 0, 1); g.scale.set(1, Math.max(.001, s), 1); g.visible = s > .002; });
    jibs.current.forEach((g, k) => { if (g) g.rotation.y = clock.elapsedTime * .2 + k * 2; });
  });
  // Tower cranes on site while investment or a delayed decision is still in the pipeline.
  return <group>{spots.map(([x, z], k) => <group key={k} ref={g => { cranes.current[k] = g; }} position={[x, 0, z]}>
    <RBox size={[1, .3, 1]} r={.05} color={palette.grey} position={[0, .15, 0]} ghost={ghost} />
    {[[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]].map(([a, b], n) => <mesh key={n} position={[a, 4.6, b]} castShadow><boxGeometry args={[.07, 9, .07]} /><Mat color={palette.yellow} ghost={ghost} /></mesh>)}
    {Array.from({ length: 12 }, (_, n) => <mesh key={`x${n}`} position={[0, .6 + n * .72, .18]} rotation={[0, 0, n % 2 ? .78 : -.78]}><boxGeometry args={[.5, .04, .04]} /><Mat color={palette.yellow} ghost={ghost} /></mesh>)}
    <group ref={g => { jibs.current[k] = g; }} position={[0, 9.1, 0]}>
      <RBox size={[6.5, .3, .3]} r={.05} color={palette.yellow} position={[1.6, 0, 0]} ghost={ghost} />
      <RBox size={[.8, .6, .7]} r={.08} color={palette.white} position={[-1.2, -.1, 0]} ghost={ghost} />
      <RBox size={[.55, .5, .55]} r={.06} color={palette.grey} position={[-1.5, .4, 0]} ghost={ghost} />
      <mesh position={[3.8, -1.2, 0]}><cylinderGeometry args={[.015, .015, 2.4]} /><Mat color={palette.dark} ghost={ghost} /></mesh>
      <Pallet position={[3.8, -2.85, 0]} ghost={ghost} />
    </group>
  </group>)}</group>;
}

// Customers arrive as delivery trucks: busy bays get a truck that drives in through the entry gate, reverses onto
// the dock, unloads and leaves by the exit gate. Lost customers (churn) are trucks that drive past the site.
const v = (x: number, z: number) => new Vector3(x, 0, z);
function dockRoute(bay: number) {
  const x = bayX(bay), into = new CurvePath<Vector3>(), back = new CurvePath<Vector3>(), out = new CurvePath<Vector3>();
  into.add(new LineCurve3(v(-34, ROAD_Z), v(ENTRY_X - 2, ROAD_Z)));
  into.add(new QuadraticBezierCurve3(v(ENTRY_X - 2, ROAD_Z), v(ENTRY_X, ROAD_Z), v(ENTRY_X, ROAD_Z - 2)));
  into.add(new QuadraticBezierCurve3(v(ENTRY_X, ROAD_Z - 2), v(ENTRY_X, YARD_Z), v(ENTRY_X + 2, YARD_Z)));
  into.add(new LineCurve3(v(ENTRY_X + 2, YARD_Z), v(x + 3.6, YARD_Z)));
  back.add(new QuadraticBezierCurve3(v(x + 3.6, YARD_Z), v(x, YARD_Z), v(x, 4.4)));
  back.add(new LineCurve3(v(x, 4.4), v(x, 3.05)));
  out.add(new LineCurve3(v(x, 3.05), v(x, 4.6)));
  out.add(new QuadraticBezierCurve3(v(x, 4.6), v(x, YARD_Z + .5), v(x + 2.2, YARD_Z + .5)));
  out.add(new LineCurve3(v(x + 2.2, YARD_Z + .5), v(EXIT_X - 2, YARD_Z + .5)));
  out.add(new QuadraticBezierCurve3(v(EXIT_X - 2, YARD_Z + .5), v(EXIT_X, YARD_Z + .5), v(EXIT_X, ROAD_Z - 1.4)));
  out.add(new QuadraticBezierCurve3(v(EXIT_X, ROAD_Z - 1.4), v(EXIT_X, ROAD_Z), v(EXIT_X + 2, ROAD_Z)));
  out.add(new LineCurve3(v(EXIT_X + 2, ROAD_Z), v(34, ROAD_Z)));
  const legs = [{ c: into, t: into.getLength() / 7, rev: false }, { c: back, t: back.getLength() / 1.8, rev: true }, { c: null, t: 18, rev: false }, { c: out, t: out.getLength() / 7, rev: false }];
  return { legs, total: legs.reduce((n, l) => n + l.t, 0) };
}
const passRoute = (() => { const c = new CurvePath<Vector3>(); c.add(new LineCurve3(v(-34, ROAD_Z), v(34, ROAD_Z))); return c; })();
const heading = (d: Vector3, rev: boolean) => rev ? Math.atan2(d.z, -d.x) : Math.atan2(-d.z, d.x);

function Customers({ live, ghost, i }: { live: Live; ghost?: boolean; i: Interaction }) {
  const routes = useMemo(() => Array.from({ length: BAYS }, (_, b) => dockRoute(b)), []);
  const docked = useRef<(Group | null)[]>([]), passing = useRef<(Group | null)[]>([]);
  const p = useMemo(() => new Vector3(), []), d = useMemo(() => new Vector3(), []);
  const PASS = 4;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, { arrivals, churn } = live.current, active = MathUtils.clamp(arrivals * 2.5, 0, BAYS);
    routes.forEach((r, b) => {
      const g = docked.current[b]; if (!g) return;
      const show = MathUtils.clamp(active - b, 0, 1); g.visible = show > .01;
      // Each bay's truck keeps its own rhythm and spends most of it at the dock.
      let local = (t + hash(b, 11) * r.total) % r.total;
      for (const leg of r.legs) {
        if (local > leg.t) { local -= leg.t; continue; }
        if (!leg.c) { g.position.set(bayX(b), 0, 3.05); g.rotation.y = -Math.PI / 2; break; }
        const u = Math.min(1, local / leg.t); leg.c.getPointAt(u, p); leg.c.getTangentAt(Math.min(.999, u), d);
        g.position.copy(p); g.rotation.y = heading(d, leg.rev); break;
      }
      g.scale.setScalar(show);
    });
    passing.current.forEach((g, k) => {
      if (!g) return;
      const show = MathUtils.clamp(churn * 20 - k, 0, 1); g.visible = show > .01;
      const u = ((t / 14 + k / PASS + hash(k, 12)) % 1);
      passRoute.getPointAt(u, p); g.position.copy(p); g.position.z += .02; g.rotation.y = 0; g.scale.setScalar(show);
    });
  });
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-12, .02, 11]} {...interactive(i, 'customers')}><planeGeometry args={[30, 3.4]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    {routes.map((_, b) => <Truck key={b} ref={g => { docked.current[b] = g; }} ghost={ghost} cab={b % 3 === 1 ? palette.white : palette.blue} />)}
    {Array.from({ length: PASS }, (_, k) => <Truck key={`p${k}`} ref={g => { passing.current[k] = g; }} ghost={ghost} cab="#a4adbb" />)}
  </group>;
}

/** Forklifts shuttle pallets between the staging area and the docks; their pace follows team productivity. */
function Forklifts({ live, ghost }: { live: Live; ghost?: boolean }) {
  const lifts = useRef<(Group | null)[]>([]), phase = useRef([0, .33, .66]);
  useFrame((_, dt) => {
    const speed = .03 + .07 * live.current.lit;
    lifts.current.forEach((g, k) => {
      if (!g) return;
      phase.current[k] = (phase.current[k] + speed * Math.min(dt, .1)) % 1;
      const s = phase.current[k], a = v(-8.2, 2.8 + k * 1.5), b = v(bayX(k * 2) , 4.3);
      const there = s < .5, u = MathUtils.smootherstep(there ? s * 2 : (s - .5) * 2, 0, 1);
      g.position.lerpVectors(there ? a : b, there ? b : a, u);
      // Drive forks-first to the dock, reverse back to the stack.
      g.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
    });
  });
  return <group>{[0, 1, 2].map(k => <Forklift key={k} ref={g => { lifts.current[k] = g; }} ghost={ghost} />)}</group>;
}

/** Staff on the yard in hi-vis: headcount sets how many, morale how briskly they move; leavers walk off site. */
function Staff({ live, ghost, i }: { live: Live; ghost?: boolean; i: Interaction }) {
  const MAX = 60, bodies = useRef<InstancedMesh>(null), vests = useRef<InstancedMesh>(null), heads = useRef<InstancedMesh>(null), hats = useRef<InstancedMesh>(null), dummy = useMemo(() => new Object3D(), []);
  useFrame(({ clock }) => {
    const { staff, morale, leaving } = live.current, t = clock.elapsedTime, pace = .2 + morale;
    for (let k = 0; k < MAX; k++) {
      const visible = MathUtils.clamp(staff - k, 0, 1), hx = -6 + hash(k, 1) * 15, hz = 3.4 + hash(k, 2) * 3.2;
      let x: number, z: number, s = visible;
      if (hash(k, 5) < leaving) {
        const u = (t * .06 * (1 + hash(k, 6)) + hash(k, 7)) % 1, gx = ENTRY_X, gz = FENCE_Z + 1.4;
        x = hx + (gx - hx) * Math.min(1, u * 1.3); z = hz + (gz - hz) * Math.min(1, u * 1.3); s *= u > .8 ? (1 - u) / .2 : 1;
      } else {
        const a = t * pace * (.3 + hash(k, 8) * .6) + hash(k, 9) * 6.28, r = .3 + hash(k, 10) * .7;
        x = hx + Math.cos(a) * r; z = hz + Math.sin(a) * r * .6;
      }
      const bob = Math.abs(Math.sin(t * pace * 7 + k)) * .04 * morale;
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.max(.001, s));
      dummy.position.set(x, .42 + bob, z); dummy.updateMatrix(); bodies.current?.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, .56 + bob, z); dummy.updateMatrix(); vests.current?.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, .84 + bob, z); dummy.updateMatrix(); heads.current?.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, .9 + bob, z); dummy.updateMatrix(); hats.current?.setMatrixAt(k, dummy.matrix);
    }
    for (const m of [bodies.current, vests.current, heads.current, hats.current]) if (m) m.instanceMatrix.needsUpdate = true;
  });
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.5, .03, 4.9]} {...interactive(i, 'staff')}><planeGeometry args={[16, 3.6]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    <instancedMesh ref={bodies} args={[undefined, undefined, MAX]} castShadow frustumCulled={false}><capsuleGeometry args={[.11, .4, 4, 10]} /><meshStandardMaterial color="#26324d" roughness={.7} transparent={ghost} opacity={ghost ? .3 : 1} /></instancedMesh>
    <instancedMesh ref={vests} args={[undefined, undefined, MAX]} castShadow frustumCulled={false}><cylinderGeometry args={[.135, .125, .24, 12]} /><meshStandardMaterial color="#ff8a1f" roughness={.5} emissive="#ff6a00" emissiveIntensity={.12} transparent={ghost} opacity={ghost ? .3 : 1} /></instancedMesh>
    <instancedMesh ref={heads} args={[undefined, undefined, MAX]} castShadow frustumCulled={false}><sphereGeometry args={[.095, 12, 10]} /><meshStandardMaterial color="#e6b896" roughness={.7} transparent={ghost} opacity={ghost ? .3 : 1} /></instancedMesh>
    <instancedMesh ref={hats} args={[undefined, undefined, MAX]} frustumCulled={false}><sphereGeometry args={[.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={palette.yellow} roughness={.3} transparent={ghost} opacity={ghost ? .3 : 1} /></instancedMesh>
  </group>;
}

const anchors: Record<Part, [number, number, number]> = {
  revenue: [TOWER.x, 0, TOWER.z + 2.4], businessMomentum: [FLYWHEEL[0], 0, FLYWHEEL[2] + 2.2], cash: [SILO[0], 0, SILO[2] + 2.4],
  debt: [GANTRY[0] + 1.6, 0, GANTRY[2] + .9], staff: [1.5, 0, 5.4], customers: [-12, 0, ROAD_Z + .2],
};

export default function Campus({ frame, ghost, labels, interaction = {}, reduced, position = [0, 0, 0], title }: { frame: SceneFrame; ghost?: boolean; labels?: Labels; interaction?: Interaction; reduced: boolean; position?: [number, number, number]; title?: string }) {
  const live = useRef<Numeric>(numeric(frame));
  const i = ghost ? {} : interaction, hovered = ghost ? null : interaction.hovered;
  const towerTop = frame.floors * TOWER.floor + 2.4;
  return <group position={position}>
    <Driver live={live} target={frame} reduced={reduced} />
    <Ground ghost={ghost} />
    <Warehouse live={live} ghost={ghost} health={frame.health} />
    <Tower live={live} ghost={ghost} health={frame.health} i={i} />
    <Flywheel live={live} ghost={ghost} i={i} />
    <CashSilo live={live} ghost={ghost} i={i} />
    <Debt live={live} ghost={ghost} i={i} />
    <Cranes live={live} ghost={ghost} />
    <Customers live={live} ghost={ghost} i={i} />
    <Forklifts live={live} ghost={ghost} />
    <Staff live={live} ghost={ghost} i={i} />
    {hovered && <group position={anchors[hovered]}><Pin /></group>}
    {title && <Tag position={[0, Math.max(towerTop, 6), -2]}><strong className={`live-title ${frame.health}`}>{title}</strong></Tag>}
    {labels && <>
      <Tag position={[TOWER.x, towerTop, TOWER.z]} active={hovered === 'revenue'}>Revenue <b>{labels.revenue}</b></Tag>
      <Tag position={[FLYWHEEL[0], 6, FLYWHEEL[2]]} active={hovered === 'businessMomentum'}>Momentum <b>{labels.momentum}</b></Tag>
      <Tag position={[SILO[0], 6.6, SILO[2]]} active={hovered === 'cash'}>Cash <b>{labels.cash}</b></Tag>
      <Tag position={[GANTRY[0] + 1.6, 5.7, GANTRY[2]]} active={hovered === 'debt'}>Debt <b>{labels.debt}</b></Tag>
      <Tag position={[-2.5, 1.6, 6.4]} active={hovered === 'staff'}>Staff <b>{labels.staff}</b></Tag>
      <Tag position={[-16, 1.2, ROAD_Z]} active={hovered === 'customers'}>Customers <b>{labels.customers}</b></Tag>
    </>}
  </group>;
}
