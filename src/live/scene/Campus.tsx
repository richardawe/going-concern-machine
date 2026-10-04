import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Color, MathUtils, Object3D, type Group, type InstancedMesh, type Mesh, type MeshStandardMaterial, type PointLight } from 'three';
import type { Health, SceneFrame } from '../frame';

// One company campus. Every moving part reads `live`, a damped copy of the target SceneFrame, so a new year eases in
// over about two seconds instead of jumping. Nothing here invents a number: see frame.ts for what drives what.

type Numeric = Omit<SceneFrame, 'weather' | 'health' | 'alarm' | 'year'> & { alarm: number };
export type Live = MutableRefObject<Numeric>;
export interface Labels { revenue: string; momentum: string; cash: string; debt: string; staff: string; customers: string }
export type Pick = (metric: string) => void;

const FLOOR = .62, TOWER_W = 3.2, MAX_FLOORS = 20, WIN_PER_FACE = 3;
const hash = (i: number, k = 0) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const numeric = (f: SceneFrame): Numeric => ({ floors: f.floors, lit: f.lit, spin: f.spin, wobble: f.wobble, cashLevel: f.cashLevel, cashFlow: f.cashFlow, debtWeights: f.debtWeights, alarm: f.alarm ? 1 : 0, staff: f.staff, morale: f.morale, leaving: f.leaving, arrivals: f.arrivals, churn: f.churn, cranes: f.cranes });
export const healthColor: Record<Health, string> = { thriving: '#2fbf71', steady: '#3c74f5', struggling: '#e8a33a', stalled: '#e2483a' };

function Mat({ color, ghost, ...rest }: { color: string; ghost?: boolean; metalness?: number; roughness?: number; emissive?: string; emissiveIntensity?: number }) {
  return <meshStandardMaterial color={color} transparent={ghost} opacity={ghost ? .28 : 1} depthWrite={!ghost} metalness={.2} roughness={.65} {...rest} />;
}
/** Click and hover affordance for the parts that open the inspector. */
function pickable(pick: Pick | undefined, metric: string) {
  if (!pick) return {};
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); pick(metric); },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { document.body.style.cursor = ''; },
  };
}
function Tag({ position, children }: { position: [number, number, number]; children: ReactNode }) {
  return <Html position={position} center distanceFactor={20} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}><div className="live-tag">{children}</div></Html>;
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

function Tower({ live, ghost, pick, health }: { live: Live; ghost?: boolean; pick?: Pick; health: Health }) {
  const body = useRef<Mesh>(null), cap = useRef<Group>(null), windows = useRef<InstancedMesh>(null);
  const beacon = useRef<MeshStandardMaterial>(null), glow = useRef<PointLight>(null);
  const count = MAX_FLOORS * 4 * WIN_PER_FACE, dummy = useMemo(() => new Object3D(), []);
  const on = useMemo(() => new Color('#ffd27a'), []), off = useMemo(() => new Color('#2a3340'), []);
  useFrame(({ clock }) => {
    const f = live.current.floors, h = f * FLOOR;
    if (body.current) { body.current.scale.y = h; body.current.position.y = h / 2; }
    if (cap.current) cap.current.position.y = h;
    const w = windows.current; if (!w) return;
    let n = 0;
    for (let floor = 0; floor < MAX_FLOORS; floor++) for (let face = 0; face < 4; face++) for (let k = 0; k < WIN_PER_FACE; k++, n++) {
      const visible = floor + .85 < f, along = (k - (WIN_PER_FACE - 1) / 2) * .85, out = TOWER_W / 2 + .01, y = floor * FLOOR + .36;
      const [x, z, ry] = face === 0 ? [along, out, 0] : face === 1 ? [out, -along, Math.PI / 2] : face === 2 ? [-along, -out, Math.PI] : [-out, along, -Math.PI / 2];
      dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.setScalar(visible ? 1 : 0); dummy.updateMatrix();
      w.setMatrixAt(n, dummy.matrix); w.setColorAt(n, hash(n, 3) < live.current.lit ? on : off);
    }
    w.instanceMatrix.needsUpdate = true; if (w.instanceColor) w.instanceColor.needsUpdate = true;
    // The beacon flashes red when an emergency loan was drawn this year.
    const alarm = live.current.alarm, flash = alarm * (Math.sin(clock.elapsedTime * 9) > 0 ? 1 : .15);
    if (beacon.current) beacon.current.emissiveIntensity = .2 + 3 * flash;
    if (glow.current) glow.current.intensity = 14 * flash;
  });
  return <group>
    <mesh ref={body} castShadow {...pickable(pick, 'revenue')}><boxGeometry args={[TOWER_W, 1, TOWER_W]} /><Mat color="#8d97a5" metalness={.5} roughness={.35} ghost={ghost} /></mesh>
    <instancedMesh ref={windows} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[.55, .34]} /><meshBasicMaterial toneMapped={false} transparent={ghost} opacity={ghost ? .3 : 1} />
    </instancedMesh>
    <group ref={cap}>
      <mesh position={[0, .12, 0]}><boxGeometry args={[TOWER_W + .3, .24, TOWER_W + .3]} /><Mat color="#5d6673" ghost={ghost} /></mesh>
      <mesh position={[0, .55, 0]}><cylinderGeometry args={[.05, .05, .7]} /><Mat color="#3b4048" ghost={ghost} /></mesh>
      <mesh position={[0, .95, 0]}><sphereGeometry args={[.16, 16, 12]} /><meshStandardMaterial ref={beacon} color="#7a1d14" emissive="#ff2d1a" emissiveIntensity={.2} transparent={ghost} opacity={ghost ? .3 : 1} /></mesh>
      {!ghost && <pointLight ref={glow} position={[0, 1.2, 0]} color="#ff3b28" intensity={0} distance={14} />}
      {/* A flag in the health colour: green thriving, blue steady, amber struggling, red stalled. */}
      <mesh position={[.42, .62, 0]}><boxGeometry args={[.7, .38, .03]} /><Mat color={healthColor[health]} emissive={healthColor[health]} emissiveIntensity={.5} ghost={ghost} /></mesh>
    </group>
    {/* Entrance */}
    <mesh position={[0, .45, TOWER_W / 2 + .02]}><planeGeometry args={[1, .9]} /><Mat color="#222830" ghost={ghost} /></mesh>
  </group>;
}

function Flywheel({ live, ghost, pick }: { live: Live; ghost?: boolean; pick?: Pick }) {
  const wheel = useRef<Group>(null), mount = useRef<Group>(null);
  useFrame(({ clock }, dt) => {
    const { spin, wobble } = live.current, t = clock.elapsedTime;
    if (wheel.current) wheel.current.rotation.z -= spin * Math.min(dt, .1);
    if (mount.current) { mount.current.rotation.x = Math.sin(t * 7.3) * wobble * .16; mount.current.rotation.y = Math.cos(t * 5.1) * wobble * .12; }
  });
  return <group position={[-7.2, 0, .5]}>
    <mesh position={[0, 1.25, -.55]}><boxGeometry args={[.4, 2.5, .25]} /><Mat color="#596270" ghost={ghost} /></mesh>
    <mesh position={[0, 1.25, .55]}><boxGeometry args={[.4, 2.5, .25]} /><Mat color="#596270" ghost={ghost} /></mesh>
    <group ref={mount} position={[0, 2.7, 0]}>
      <group ref={wheel} {...pickable(pick, 'businessMomentum')}>
        <mesh castShadow><torusGeometry args={[2, .26, 14, 48]} /><Mat color="#b3bac4" metalness={.85} roughness={.28} ghost={ghost} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.42, .42, .7, 24]} /><Mat color="#3c74f5" metalness={.6} roughness={.3} ghost={ghost} /></mesh>
        {Array.from({ length: 6 }, (_, i) => <mesh key={i} rotation={[0, 0, i * Math.PI / 3]} position={[Math.cos(i * Math.PI / 3) * 1.1, Math.sin(i * Math.PI / 3) * 1.1, 0]}><boxGeometry args={[1.8, .16, .16]} /><Mat color="#8a929d" metalness={.7} ghost={ghost} /></mesh>)}
        {/* A coloured marker makes the rotation readable at low speed. */}
        <mesh position={[0, 2, .2]}><boxGeometry args={[.32, .5, .14]} /><Mat color="#e8a33a" emissive="#e8a33a" emissiveIntensity={.4} ghost={ghost} /></mesh>
      </group>
    </group>
  </group>;
}

function CashTank({ live, ghost, pick }: { live: Live; ghost?: boolean; pick?: Pick }) {
  const H = 4.2, liquid = useRef<Mesh>(null), drops = useRef<InstancedMesh>(null), dummy = useMemo(() => new Object3D(), []);
  const plus = useMemo(() => new Color('#ffb52e'), []), minus = useMemo(() => new Color('#e2483a'), []);
  const N = 10, from = TOWER_W / 2, to = 5.6;
  useFrame(({ clock }) => {
    const { cashLevel, cashFlow } = live.current, level = Math.max(.001, cashLevel);
    if (liquid.current) { liquid.current.scale.y = level * H; liquid.current.position.y = level * H / 2 + .05; }
    const d = drops.current; if (!d) return;
    const speed = .15 + Math.abs(cashFlow) * 1.3, show = Math.abs(cashFlow) > .02;
    for (let i = 0; i < N; i++) {
      const u = (clock.elapsedTime * speed + i / N) % 1, along = cashFlow >= 0 ? u : 1 - u;
      dummy.position.set(from + (to - from) * along, 1.2, 0); dummy.scale.setScalar(show ? .9 + .3 * Math.abs(cashFlow) : 0); dummy.updateMatrix();
      d.setMatrixAt(i, dummy.matrix); d.setColorAt(i, cashFlow >= 0 ? plus : minus);
    }
    d.instanceMatrix.needsUpdate = true; if (d.instanceColor) d.instanceColor.needsUpdate = true;
  });
  return <group>
    {/* Pipe from the business to the reserve: amber drops flow in when free cash flow is positive, red drops drain out when negative. */}
    <mesh position={[(from + to) / 2, 1.2, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.2, .2, to - from, 16, 1, true]} /><meshStandardMaterial color="#cfe3f2" transparent opacity={ghost ? .1 : .3} depthWrite={false} /></mesh>
    <instancedMesh ref={drops} args={[undefined, undefined, N]} frustumCulled={false}><sphereGeometry args={[.13, 10, 8]} /><meshBasicMaterial toneMapped={false} transparent={ghost} opacity={ghost ? .3 : 1} /></instancedMesh>
    <group position={[7, 0, 0]} {...pickable(pick, 'cash')}>
      <mesh position={[0, H / 2 + .05, 0]}><cylinderGeometry args={[1.45, 1.45, H, 32, 1, true]} /><meshStandardMaterial color="#d8ecfa" transparent opacity={ghost ? .08 : .22} depthWrite={false} roughness={.1} /></mesh>
      <mesh ref={liquid}><cylinderGeometry args={[1.36, 1.36, 1, 32]} /><meshStandardMaterial color="#f5a623" emissive="#f5a623" emissiveIntensity={.55} transparent opacity={ghost ? .3 : .9} /></mesh>
      <mesh position={[0, .03, 0]}><cylinderGeometry args={[1.6, 1.7, .1, 32]} /><Mat color="#596270" ghost={ghost} /></mesh>
      <mesh position={[0, H + .1, 0]}><torusGeometry args={[1.45, .07, 8, 40]} /><Mat color="#596270" ghost={ghost} /></mesh>
      <mesh position={[0, H + .1, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.45, .07, 8, 40]} /><Mat color="#596270" ghost={ghost} /></mesh>
    </group>
  </group>;
}

function Debt({ live, ghost, pick }: { live: Live; ghost?: boolean; pick?: Pick }) {
  const weights = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    const d = live.current.debtWeights;
    weights.current.forEach((g, i) => { if (!g) return; const s = MathUtils.clamp(d - i, 0, 1); g.scale.setScalar(s); g.rotation.z = Math.sin(clock.elapsedTime * 1.3 + i) * .05 * s; });
  });
  // A gantry beside the cash tank; each weight is debt worth 10% of Year 0 revenue.
  return <group position={[10.4, 0, -1.8]} {...pickable(pick, 'debt')}>
    {[-.3, 3.3].map(x => <mesh key={x} position={[x, 2.4, 0]}><boxGeometry args={[.22, 4.8, .22]} /><Mat color="#4a515c" ghost={ghost} /></mesh>)}
    <mesh position={[1.5, 4.8, 0]}><boxGeometry args={[4.2, .22, .3]} /><Mat color="#4a515c" ghost={ghost} /></mesh>
    {Array.from({ length: 12 }, (_, i) => <group key={i} ref={g => { weights.current[i] = g; }} position={[(i % 6) * .55 + .1, 4.7, i < 6 ? .12 : -.12]}>
      <mesh position={[0, -.6 - (i >= 6 ? .9 : 0), 0]}><cylinderGeometry args={[.025, .025, 1.2 + (i >= 6 ? 1.8 : 0)]} /><Mat color="#2b2f35" ghost={ghost} /></mesh>
      <mesh position={[0, -1.4 - (i >= 6 ? 1.8 : 0), 0]} castShadow><boxGeometry args={[.42, .5, .42]} /><Mat color="#8f2a20" metalness={.6} roughness={.4} ghost={ghost} /></mesh>
    </group>)}
  </group>;
}

function Staff({ live, ghost }: { live: Live; ghost?: boolean }) {
  const MAX = 60, mesh = useRef<InstancedMesh>(null), dummy = useMemo(() => new Object3D(), []);
  const low = useMemo(() => new Color('#d9534f'), []), high = useMemo(() => new Color('#3c74f5'), []), tint = useMemo(() => new Color(), []);
  useFrame(({ clock }) => {
    const m = mesh.current; if (!m) return;
    const { staff, morale, leaving } = live.current, t = clock.elapsedTime, pace = .25 + morale * 1.1;
    tint.copy(low).lerp(high, MathUtils.smoothstep(morale, .35, .8));
    for (let i = 0; i < MAX; i++) {
      const visible = MathUtils.clamp(staff - i, 0, 1);
      const hx = -5 + hash(i, 1) * 10, hz = 3.6 + hash(i, 2) * 4;
      let x: number, z: number, s = visible;
      if (hash(i, 5) < leaving) {
        // Leavers walk off the site towards the exit, then a replacement (if any) appears back at the plaza.
        const u = (t * .09 * (1 + hash(i, 6)) + hash(i, 7)) % 1;
        x = hx + u * (16 - hx); z = hz + u * 2; s *= u > .85 ? (1 - u) / .15 : 1;
      } else {
        const a = t * pace * (.4 + hash(i, 8)) + hash(i, 9) * 6.28, r = .35 + hash(i, 10) * .5;
        x = hx + Math.cos(a) * r; z = hz + Math.sin(a) * r;
      }
      dummy.position.set(x, .38 + Math.abs(Math.sin(t * pace * 6 + i)) * .05 * morale, z); dummy.scale.setScalar(s); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, tint);
    }
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} castShadow frustumCulled={false}>
    <capsuleGeometry args={[.13, .38, 4, 8]} /><meshStandardMaterial transparent={ghost} opacity={ghost ? .3 : 1} />
  </instancedMesh>;
}

function Customers({ live, ghost, pick }: { live: Live; ghost?: boolean; pick?: Pick }) {
  const MAX = 40, T = 9, mesh = useRef<InstancedMesh>(null), dummy = useMemo(() => new Object3D(), []);
  const loyal = useMemo(() => new Color('#2bb3a3'), []), lost = useMemo(() => new Color('#9aa1aa'), []);
  const ROAD = 9.6, DOOR = TOWER_W / 2 + .4, START = -16, TURN = 0, END = 16;
  useFrame(({ clock }) => {
    const m = mesh.current; if (!m) return;
    const { arrivals, churn } = live.current, active = arrivals * T, t = clock.elapsedTime;
    for (let i = 0; i < MAX; i++) {
      const phase = t / T + i * .618, u = phase % 1, cycle = Math.floor(phase), churner = hash(i, cycle) < churn;
      const leg1 = .62, s = MathUtils.clamp(active - i, 0, 1) * (u > .95 ? (1 - u) / .05 : 1);
      let x: number, z: number;
      // Customers come down the road; most turn in at the door, churners walk on past.
      if (u < leg1) { x = START + (TURN - START) * (u / leg1); z = ROAD; }
      else if (churner) { x = TURN + (END - TURN) * ((u - leg1) / (1 - leg1)); z = ROAD; }
      else { x = TURN; z = ROAD + (DOOR - ROAD) * ((u - leg1) / (1 - leg1)); }
      dummy.position.set(x, .2, z); dummy.rotation.set(0, u * 6, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, churner && u >= leg1 ? lost : loyal);
    }
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <group>
    <mesh position={[0, .01, 9.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow {...pickable(pick, 'customers')}><planeGeometry args={[34, 1.6]} /><Mat color="#3f454e" ghost={ghost} /></mesh>
    <mesh position={[0, .012, (9.6 + DOOR) / 2]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.2, 9.6 - DOOR]} /><Mat color="#6d747e" ghost={ghost} /></mesh>
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} castShadow frustumCulled={false}><boxGeometry args={[.32, .32, .32]} /><meshStandardMaterial transparent={ghost} opacity={ghost ? .3 : 1} /></instancedMesh>
  </group>;
}

function Cranes({ live, ghost }: { live: Live; ghost?: boolean }) {
  const cranes = useRef<(Group | null)[]>([]), jibs = useRef<(Group | null)[]>([]);
  const spots: [number, number][] = [[-3.4, -3.2], [-3.6, 2.4], [.4, -4.4]];
  useFrame(({ clock }) => {
    const c = live.current.cranes;
    cranes.current.forEach((g, i) => { if (g) g.scale.set(1, MathUtils.clamp(c - i, .001, 1), 1); });
    jibs.current.forEach((g, i) => { if (g) g.rotation.y = clock.elapsedTime * .25 + i * 2; });
  });
  // Cranes on site while investment or a delayed decision is still in the pipeline.
  return <group>{spots.map(([x, z], i) => <group key={i} ref={g => { cranes.current[i] = g; }} position={[x, 0, z]}>
    <mesh position={[0, 3.5, 0]}><boxGeometry args={[.24, 7, .24]} /><Mat color="#e8b62c" ghost={ghost} /></mesh>
    <group ref={g => { jibs.current[i] = g; }} position={[0, 7, 0]}>
      <mesh position={[1.2, 0, 0]}><boxGeometry args={[4, .18, .18]} /><Mat color="#e8b62c" ghost={ghost} /></mesh>
      <mesh position={[2.8, -.8, 0]}><cylinderGeometry args={[.015, .015, 1.6]} /><Mat color="#333" ghost={ghost} /></mesh>
      <mesh position={[2.8, -1.7, 0]}><boxGeometry args={[.35, .25, .35]} /><Mat color="#596270" ghost={ghost} /></mesh>
    </group>
  </group>)}</group>;
}

export default function Campus({ frame, ghost, labels, pick, reduced, position = [0, 0, 0], title }: { frame: SceneFrame; ghost?: boolean; labels?: Labels; pick?: Pick; reduced: boolean; position?: [number, number, number]; title?: string }) {
  const live = useRef<Numeric>(numeric(frame));
  const p = ghost ? undefined : pick;
  return <group position={position}>
    <Driver live={live} target={frame} reduced={reduced} />
    {/* Ground, plaza and a ring in the health colour around the site. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.01, 2]} receiveShadow><planeGeometry args={[30, 20]} /><Mat color="#c3c8bf" ghost={ghost} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .005, 5.6]} receiveShadow><planeGeometry args={[11, 4.8]} /><Mat color="#e1e3dc" ghost={ghost} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .02, 0]}><ringGeometry args={[2.6, 2.85, 48]} /><meshBasicMaterial color={healthColor[frame.health]} toneMapped={false} transparent opacity={ghost ? .3 : .9} /></mesh>
    <Tower live={live} ghost={ghost} pick={p} health={frame.health} />
    <Flywheel live={live} ghost={ghost} pick={p} />
    <CashTank live={live} ghost={ghost} pick={p} />
    <Debt live={live} ghost={ghost} pick={p} />
    <Staff live={live} ghost={ghost} />
    <Customers live={live} ghost={ghost} pick={p} />
    <Cranes live={live} ghost={ghost} />
    {title && <Tag position={[0, frame.floors * FLOOR + 2.2, 0]}><strong className={`live-title ${frame.health}`}>{title}</strong></Tag>}
    {labels && <>
      <Tag position={[0, -.2, 3.4]}>Revenue <b>{labels.revenue}</b></Tag>
      <Tag position={[-7.2, 5.6, .5]}>Momentum <b>{labels.momentum}</b></Tag>
      <Tag position={[7, 5, 0]}>Cash <b>{labels.cash}</b></Tag>
      <Tag position={[11.9, 5.5, -1.8]}>Debt <b>{labels.debt}</b></Tag>
      <Tag position={[-4.6, .1, 7.9]}>Staff <b>{labels.staff}</b></Tag>
      <Tag position={[-11, .1, 10.8]}>Customers <b>{labels.customers}</b></Tag>
    </>}
  </group>;
}
