import { useEffect, useRef } from 'react';
import { C, lever, P, PLATE, SL, slotHit } from './iso';

// One Anatomy-style figure per module: a machine on the shared base plate, worked by a single lever. A figure spec holds
// the illustrative model (lever value → readout) and draws its parts; this component runs the animation, the lever drag
// and the keyboard. Moving parts are rebuilt each frame from refs, never through React state.

export interface FigureSpec<S = unknown> {
  title: string;
  /** Taller machines widen the frame upwards; the plate and lever stay where they are. */ viewBox?: string;
  /** The lever: its range and step in model units, the value marked on the scale, and how to say a value aloud. */
  control: { label: string; hint: string; min: number; max: number; step: number; home: number; say: (v: number) => string };
  /** Static parts drawn once on top of the plate. */ base: string;
  /** Animation state, advanced each frame unless the reader prefers reduced motion. */ init: (v: number) => S; step: (s: S, v: number, dt: number) => void;
  draw: (s: S, v: number, t: number) => string;
  readout: (v: number) => [string, string]; loss: (v: number) => boolean;
  legend: { flow?: 'in' | 'out'; label: string }[]; caption: string;
}

const snap = (spec: FigureSpec<any>, v: number) => {
  const { min, max, step } = spec.control;
  return Math.max(min, Math.min(max, Math.round((v - min) / step) * step + min)) + 0;
};
const tidy = (v: number) => Math.round(v * 1e6) / 1e6;

export default function IsoFigure({ spec, value, onChange, title, figure }: { spec: FigureSpec<any>; value: number; onChange: (v: number) => void; title?: string; figure: number }) {
  const svg = useRef<SVGSVGElement>(null), layer = useRef<SVGGElement>(null), out = useRef<HTMLSpanElement>(null);
  const target = useRef(value), onChangeRef = useRef(onChange);
  target.current = value; onChangeRef.current = onChange;
  const { min, max, step, home } = spec.control, ticks = Math.round((max - min) / step), every = Math.ceil(ticks / 40);
  const frac = (v: number) => (v - min) / (max - min);

  useEffect(() => {
    let shown = target.current, last = 0, raf = 0, visible = true;
    const state = spec.init(shown), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(e => { visible = e[0].isIntersecting; }); if (svg.current) io.observe(svg.current);
    const frame = (now: number) => {
      const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
      shown += (target.current - shown) * (reduced ? 1 : 1 - Math.exp(-dt * 8));
      if (!reduced) spec.step(state, shown, dt);
      if (visible && layer.current) layer.current.innerHTML = spec.draw(state, shown, reduced ? 0 : now) + lever(frac(shown), ticks / every, Math.round((home - min) / step / every));
      if (out.current) { const [a, b] = spec.readout(shown); out.current.firstChild!.textContent = a; out.current.lastChild!.textContent = b; out.current.dataset.loss = String(spec.loss(shown)); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [spec]);

  // Drag the knob along its slot, or use the arrow keys when the figure has focus.
  useEffect(() => {
    const el = svg.current; if (!el) return;
    let dragging = false;
    const worldX = (e: PointerEvent) => { const m = el.getScreenCTM(); if (!m) return null; const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return (q.x - P(0, SL.y, 0)[0]) / C; };
    const down = (e: PointerEvent) => { if (!(e.target as Element).closest('.knob, .slot-hit')) return; dragging = true; el.setPointerCapture(e.pointerId); move(e); };
    const move = (e: PointerEvent) => { if (!dragging) return; const x = worldX(e); if (x != null) onChangeRef.current(tidy(snap(spec, min + (x - SL.x0) / (SL.x1 - SL.x0) * (max - min)))); };
    const up = () => { dragging = false; };
    const key = (e: KeyboardEvent) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); onChangeRef.current(tidy(snap(spec, target.current + (e.key === 'ArrowLeft' ? -step : step)))); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('keydown', key);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('keydown', key); };
  }, [spec]);

  const [a, b] = spec.readout(value);
  return <figure className="iso-card">
    <div className="iso-stage">
      <span className="iso-corner tl">Fig {figure}</span>
      <span className="iso-corner tr">{title ?? spec.title}</span>
      <svg ref={svg} className="iso" viewBox={spec.viewBox ?? '-212 -26 535 336'} tabIndex={0} role="slider" aria-label={spec.control.label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${spec.control.say(value)}; ${a}; ${b}`}>
        <g dangerouslySetInnerHTML={{ __html: PLATE + spec.base }} />
        <g ref={layer} />
        <polygon className="slot-hit" points={slotHit()} />
      </svg>
      <span className="iso-corner bl">{spec.control.hint} · ← →</span>
      <span className="iso-corner br" ref={out} aria-hidden="true"><span>{a}</span><br /><span>{b}</span></span>
    </div>
    <figcaption>
      {spec.legend.map(l => <span key={l.label} className="iso-legend"><i className={l.flow ?? ''} />{l.label}</span>)}
      <p>{spec.caption}</p>
    </figcaption>
  </figure>;
}
