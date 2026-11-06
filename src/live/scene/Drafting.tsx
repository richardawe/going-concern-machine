import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BackSide, Box3, Color, EdgesGeometry, InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, NoToneMapping, Vector3, type Material, type Object3D } from 'three';
import { useThemeMode } from '../../components/ThemeSwitch';

// Draws the live company like the engineering drawings on the rest of the site: every surface becomes paper or an
// ink wash (by how light it was), strong warm colours (cash, warnings) become red pencil, and each object gets ink
// edges. Inks come from the page's theme (--draw-ink, --draw-paper), so the scene redraws when the theme changes.
// It only recolours: positions, sizes and every number the scene shows are the game's own.

const css = (name: string, fallback: string) => {
  const v = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  const c = new Color(); try { c.set(v || fallback); } catch { c.set(fallback); } return c;
};
const darkTheme = () => typeof document !== 'undefined' && (document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches));

type Inks = { ink: Color; paper: Color; pencil: Color };
type Tagged = { original: Color; opacity: number; transparent: boolean };
const hsl = { h: 0, s: 0, l: 0 };

function recolour(original: Color, inks: Inks, out: Color) {
  original.getHSL(hsl);
  const warm = hsl.s > .45 && (hsl.h < .17 || hsl.h > .93) && hsl.l > .2 && hsl.l < .85;
  if (warm) return out.copy(inks.pencil);
  // Light surfaces stay paper; darker ones become a wash of ink, never solid.
  return out.copy(inks.paper).lerp(inks.ink, Math.min(.42, (1 - hsl.l) * .5));
}

export default function Drafting() {
  const scene = useThree(s => s.scene), gl = useThree(s => s.gl), invalidate = useThree(s => s.invalidate);
  const [mode] = useThemeMode();
  const inks = useMemo<Inks>(() => ({ ink: new Color(), paper: new Color(), pencil: new Color() }), []);
  const edgeMat = useMemo(() => new LineBasicMaterial({ transparent: true, opacity: .9 }), []);
  // A silhouette: the back faces of a slightly larger copy, in ink, so rounded shapes get an outline too.
  const hullMat = useMemo(() => new MeshBasicMaterial({ side: BackSide }), []);
  const box = useMemo(() => new Box3(), []), size = useMemo(() => new Vector3(), []);
  const seen = useRef(new WeakSet<Object3D>()), materials = useRef(new Map<Material, Tagged>());
  const sky = useMemo(() => new Color(), []), tint = useMemo(() => new Color(), []);
  const tick = useRef(0), source = useRef<Color | null>(null);

  const apply = () => {
    for (const [m, t] of materials.current) { const mat = m as MeshBasicMaterial; recolour(t.original, inks, mat.color); mat.needsUpdate = true; }
    edgeMat.color.copy(inks.ink); hullMat.color.copy(inks.ink); invalidate();
  };
  // Theme: read the inks again and recolour everything already drawn.
  useEffect(() => {
    const dark = darkTheme();
    inks.ink.copy(css('--draw-ink', dark ? '#6f98f7' : '#1543ad'));
    inks.paper.copy(css('--draw-paper', dark ? '#121417' : '#f7f6f2'));
    inks.pencil.set(dark ? '#fb923c' : '#c2410c');
    apply();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { gl.toneMapping = NoToneMapping; gl.shadowMap.enabled = false; invalidate(); }, [gl, invalidate]);

  // New objects appear as the year plays (trucks, people, floors), so look for them a few times a second.
  const adopt = () => {
    scene.traverse(o => {
      if (seen.current.has(o)) return; seen.current.add(o);
      if (!(o instanceof Mesh) || o instanceof InstancedMesh || o.userData.draftEdge) return;
      o.castShadow = false; o.receiveShadow = false;
      const swap = (m: Material) => {
        const src = m as Material & { color?: Color; opacity: number; transparent: boolean };
        if (!src.color || materials.current.has(m)) return m;
        const lam = new MeshBasicMaterial({ color: new Color(), transparent: src.transparent, opacity: src.opacity, side: m.side, depthWrite: m.depthWrite });
        const tag = { original: src.color.clone(), opacity: src.opacity, transparent: src.transparent };
        materials.current.set(lam, tag); recolour(tag.original, inks, lam.color); return lam;
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      if (o.geometry?.attributes?.position && o.geometry.attributes.position.count < 20000) {
        const edges = new LineSegments(new EdgesGeometry(o.geometry, 28), edgeMat);
        edges.userData.draftEdge = true; edges.raycast = () => {}; seen.current.add(edges); o.add(edges);
        o.geometry.computeBoundingBox(); box.copy(o.geometry.boundingBox!); box.getSize(size);
        const big = Math.max(size.x, size.y, size.z), flat = Math.min(size.x, size.y, size.z) < .02, ws = o.getWorldScale(new Vector3()).x || 1;
        if (big < 60 && !flat && !(o.material as Material).transparent) {
          const t = .07 / ws, hull = new Mesh(o.geometry, hullMat);
          hull.scale.set(1 + t / Math.max(size.x, .05), 1 + t / Math.max(size.y, .05), 1 + t / Math.max(size.z, .05));
          hull.userData.draftEdge = true; hull.raycast = () => {}; seen.current.add(hull); o.add(hull);
        }
      }
    });
  };
  useFrame(() => {
    if (tick.current++ % 15 === 0) adopt();
    // The sky keeps a trace of the weather and the company's health, on paper.
    if (scene.background instanceof Color && scene.background !== sky) source.current = scene.background;
    if (source.current) {
      tint.copy(source.current); sky.copy(inks.paper).lerp(tint.lerp(inks.ink, .15), .18);
      scene.background = sky;
      if (scene.fog) (scene.fog as unknown as { color: Color }).color.copy(sky);
    }
  });
  return null;
}
