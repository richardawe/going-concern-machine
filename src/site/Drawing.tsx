import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { drawingUrl, engineLayers, type DrawingName } from './drawings';
import './site.css';

type Props = { name: Exclude<DrawingName, 'beamEngine'>; className?: string; fit?: 'contain' | 'cover'; position?: string; size?: string; style?: CSSProperties };

/** A drawing in the theme's ink. Decorative, so it's hidden from screen readers. */
export function Drawing({ name, className = '', fit = 'contain', position = 'center', size, style }: Props) {
  const mask = `url("${drawingUrl[name]}") ${position} / ${size ?? fit} no-repeat`;
  return <div aria-hidden="true" className={`drawing ${className}`} style={{ WebkitMask: mask, mask, ...style }} />;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The beam engine from the home page, running. The flywheel and governor are the drawing's own lines, cut out and
 * turned in place. `throttle` raises the target speed (1 = idle); `kick` bumps it briefly, e.g. while someone types.
 */
export function RunningEngine({ throttle = 1, kick = 0, showSpeed = true }: { throttle?: number; kick?: number; showSpeed?: boolean }) {
  const fly = useRef<HTMLDivElement>(null), rpm = useRef<HTMLElement>(null);
  const [hover, setHover] = useState(false);
  const rate = useRef(1), target = useRef(1);
  target.current = Math.max(throttle, hover ? 3 : 1);
  useEffect(() => { rate.current = Math.min(rate.current + 0.8, 5); }, [kick]);
  useEffect(() => {
    if (reduced()) return;
    const anim = fly.current?.getAnimations()[0];
    let frame = 0;
    const tick = () => {
      rate.current += (target.current - rate.current) * 0.03;
      if (anim) anim.playbackRate = rate.current;
      if (rpm.current) rpm.current.textContent = `${(60 / 16 * rate.current).toFixed(1)} rpm`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <figure className="running-engine" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
    <EngineStage flywheel={fly} />
    <figcaption>
      {showSpeed && <span className="engine-speed">Flywheel <b ref={rpm}>3.8 rpm</b></span>}
      <a href="#/credits">Beam engine, St Croix · Historic American Engineering Record</a>
    </figcaption>
  </figure>;
}

const layer = (url: string) => { const m = `url("${url}") center / contain no-repeat`; return { WebkitMask: m, mask: m }; };
/** The beam engine drawing as three layers; the flywheel and governor turn unless the page is told to keep still. */
export function EngineStage({ flywheel, still = false }: { flywheel?: React.Ref<HTMLDivElement>; still?: boolean }) {
  return <div className={`engine-stage ${still ? 'still' : ''}`} aria-hidden="true">
    <div className="drawing engine-base" style={layer(engineLayers.base)} />
    <div className="drawing engine-flywheel" ref={flywheel} style={layer(engineLayers.flywheel)} />
    <div className="drawing engine-governor" style={layer(engineLayers.governor)} />
  </div>;
}

/** Adds `in` to an element once it scrolls into view, so a drawing can plot itself in. */
export function usePlotIn<T extends Element>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced() || typeof IntersectionObserver !== 'function') { setShown(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, shown] as const;
}
