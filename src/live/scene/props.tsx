import { forwardRef, type ReactNode } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { Group } from 'three';

// Small, reusable models in a clean "product render" style: bevelled shapes, white bodies, royal-blue and safety-yellow
// accents. Everything is procedural, so the site needs no model files.

export const palette = {
  ground: '#dde3ed', yard: '#eef1f6', road: '#c9d1de', lane: '#ffffff', line: '#f2b632',
  white: '#fbfcfe', panel: '#eef1f6', wall: '#e3e7ef', blue: '#1f5eff', navy: '#173a8c', glass: '#7ea6dc',
  yellow: '#f5b301', dark: '#2a2f3a', grey: '#9aa3b2', tree: '#5ccf8f', treeDark: '#3fb37a', trunk: '#9a7b5f',
  amber: '#ffae1a', red: '#e5483b', pallet: '#c9a27a', box: '#d9b48a',
};

export function Mat({ color, ghost, rough = .55, metal = 0, emissive, emissiveIntensity }: { color: string; ghost?: boolean; rough?: number; metal?: number; emissive?: string; emissiveIntensity?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metal} transparent={ghost} opacity={ghost ? .3 : 1} depthWrite={!ghost} emissive={emissive} emissiveIntensity={emissiveIntensity} />;
}
/** A bevelled box. `r` is the corner radius. */
export function RBox({ size, r = .06, color, ghost, rough, metal, position, rotation, children, emissive, emissiveIntensity }: { size: [number, number, number]; r?: number; color: string; ghost?: boolean; rough?: number; metal?: number; position?: [number, number, number]; rotation?: [number, number, number]; children?: ReactNode; emissive?: string; emissiveIntensity?: number }) {
  return <RoundedBox args={size} radius={Math.min(r, ...size.map(s => s / 2 - .001))} smoothness={3} position={position} rotation={rotation} castShadow receiveShadow>
    <Mat color={color} ghost={ghost} rough={rough} metal={metal} emissive={emissive} emissiveIntensity={emissiveIntensity} />{children}
  </RoundedBox>;
}

function Wheel({ position, ghost }: { position: [number, number, number]; ghost?: boolean }) {
  return <mesh position={position} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.22, .22, .16, 18]} /><Mat color={palette.dark} rough={.8} ghost={ghost} /></mesh>;
}

/** A box truck facing +x: blue (or white) cab, white trailer with a blue stripe. Origin at ground under the trailer centre. */
export const Truck = forwardRef<Group, { cab?: string; ghost?: boolean }>(function Truck({ cab = palette.blue, ghost }, ref) {
  return <group ref={ref}>
    <RBox size={[3.1, 1.45, 1.3]} r={.1} color={palette.white} position={[-.35, 1.15, 0]} ghost={ghost} />
    <RBox size={[2.2, .16, 1.32]} r={.03} color={cab} position={[-.3, 1.25, 0]} ghost={ghost} />
    <RBox size={[3.3, .18, 1.1]} r={.04} color={palette.dark} position={[-.25, .38, 0]} ghost={ghost} />
    <group position={[1.65, 0, 0]}>
      <RBox size={[.95, 1.15, 1.28]} r={.16} color={cab} position={[0, .98, 0]} ghost={ghost} />
      <RBox size={[.08, .5, 1.1]} r={.03} color={palette.glass} rough={.1} metal={.3} position={[.46, 1.18, 0]} ghost={ghost} />
      <RBox size={[.1, .18, 1.2]} r={.04} color={palette.panel} position={[.48, .55, 0]} ghost={ghost} />
    </group>
    {[-1.4, -.85, 1.6].map(x => [.62, -.62].map(z => <Wheel key={`${x}${z}`} position={[x, .22, z]} ghost={ghost} />))}
  </group>;
});

/** A safety-yellow forklift facing +x, carrying a pallet. */
export const Forklift = forwardRef<Group, { ghost?: boolean }>(function Forklift({ ghost }, ref) {
  return <group ref={ref} scale={.85}>
    <RBox size={[1.1, .5, .8]} r={.1} color={palette.yellow} position={[0, .45, 0]} ghost={ghost} />
    <RBox size={[.45, .35, .7]} r={.12} color={palette.dark} position={[-.35, .82, 0]} ghost={ghost} />
    {[[-.05, .36], [-.05, -.36], [.4, .36], [.4, -.36]].map(([x, z], i) => <mesh key={i} position={[x * 1.2 + .1, 1.15, z]} castShadow><boxGeometry args={[.05, .9, .05]} /><Mat color={palette.dark} ghost={ghost} /></mesh>)}
    <RBox size={[.75, .06, .8]} r={.02} color={palette.dark} position={[.25, 1.6, 0]} ghost={ghost} />
    <mesh position={[.66, .9, 0]} castShadow><boxGeometry args={[.06, 1.5, .55]} /><Mat color={palette.dark} ghost={ghost} /></mesh>
    <group position={[.95, .25, 0]}>
      <mesh position={[0, 0, .18]}><boxGeometry args={[.7, .04, .1]} /><Mat color={palette.dark} ghost={ghost} /></mesh>
      <mesh position={[0, 0, -.18]}><boxGeometry args={[.7, .04, .1]} /><Mat color={palette.dark} ghost={ghost} /></mesh>
      <Pallet position={[0, .07, 0]} ghost={ghost} />
    </group>
    {[[-.35, .42], [-.35, -.42], [.35, .42], [.35, -.42]].map(([x, z], i) => <mesh key={i} position={[x, .17, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.17, .17, .12, 14]} /><Mat color={palette.dark} rough={.8} ghost={ghost} /></mesh>)}
  </group>;
});

/** A pallet of cartons. */
export function Pallet({ position, ghost, wrap }: { position?: [number, number, number]; ghost?: boolean; wrap?: string }) {
  return <group position={position}>
    <RBox size={[.7, .1, .7]} r={.015} color={palette.pallet} position={[0, .05, 0]} ghost={ghost} />
    <RBox size={[.62, .44, .62]} r={.04} color={wrap ?? palette.box} position={[0, .33, 0]} ghost={ghost} />
  </group>;
}

/** A rounded "lollipop" tree. */
export function Tree({ position, scale = 1, ghost }: { position: [number, number, number]; scale?: number; ghost?: boolean }) {
  return <group position={position} scale={scale}>
    <mesh position={[0, .45, 0]} castShadow><cylinderGeometry args={[.07, .1, .9, 8]} /><Mat color={palette.trunk} ghost={ghost} /></mesh>
    <mesh position={[0, 1.25, 0]} castShadow><sphereGeometry args={[.55, 20, 16]} /><Mat color={palette.tree} rough={.7} ghost={ghost} /></mesh>
    <mesh position={[.18, 1.05, .2]} castShadow><sphereGeometry args={[.32, 16, 12]} /><Mat color={palette.treeDark} rough={.7} ghost={ghost} /></mesh>
  </group>;
}

/** A run of mesh fencing along x from x0 to x1 at depth z, with a gap for each gate. */
export function Fence({ x0, x1, z, gates = [], ghost }: { x0: number; x1: number; z: number; gates?: [number, number][]; ghost?: boolean }) {
  const posts: number[] = []; for (let x = x0; x <= x1 + 1e-6; x += 1.6) if (!gates.some(([a, b]) => x > a && x < b)) posts.push(x);
  const spans: [number, number][] = [];
  let a = x0; for (const [g0, g1] of [...gates].sort((p, q) => p[0] - q[0])) { spans.push([a, g0]); a = g1; } spans.push([a, x1]);
  return <group>
    {posts.map(x => <mesh key={x} position={[x, .45, z]} castShadow><boxGeometry args={[.07, .9, .07]} /><Mat color={palette.grey} metal={.4} rough={.4} ghost={ghost} /></mesh>)}
    {spans.filter(([p, q]) => q - p > .1).map(([p, q]) => <mesh key={p} position={[(p + q) / 2, .45, z]}><boxGeometry args={[q - p, .8, .02]} /><meshStandardMaterial color="#c9d9cf" transparent opacity={ghost ? .08 : .32} roughness={.3} depthWrite={false} /></mesh>)}
    {spans.filter(([p, q]) => q - p > .1).map(([p, q]) => <mesh key={`r${p}`} position={[(p + q) / 2, .88, z]}><boxGeometry args={[q - p, .04, .04]} /><Mat color={palette.grey} metal={.4} rough={.4} ghost={ghost} /></mesh>)}
  </group>;
}

/** A map pin in the accent blue, standing on the ground at its origin. */
export function Pin({ color = palette.blue }: { color?: string }) {
  return <group>
    <mesh position={[0, 1.35, 0]} castShadow><sphereGeometry args={[.32, 24, 18]} /><meshStandardMaterial color={color} roughness={.25} metalness={.1} /></mesh>
    <mesh position={[0, .95, 0]} rotation={[Math.PI, 0, 0]} castShadow><coneGeometry args={[.27, .6, 24]} /><meshStandardMaterial color={color} roughness={.25} metalness={.1} /></mesh>
    <mesh position={[0, 1.38, .24]}><sphereGeometry args={[.11, 16, 12]} /><meshBasicMaterial color="#ffffff" /></mesh>
    <mesh position={[0, .02, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.25, .42, 32]} /><meshBasicMaterial color={color} transparent opacity={.35} /></mesh>
  </group>;
}
