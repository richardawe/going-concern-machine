import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Users, Target, Package, TrendingUp, Cpu, Heart, Factory, Coins, Layers, Zap, Trophy, Megaphone } from 'lucide-react';
import type { Baseline, State, StockKey } from '../model/types';
import { stockLabels } from '../model/config';
import { money, percent, type MachineView } from '../presentation';

type Props = { state: State; baseline: Baseline; view: MachineView; motion: boolean; inspect: (key: string) => void; compact?: boolean; cascade?: boolean };
const points = (radius: number, teeth: number) => Array.from({ length: teeth * 4 }, (_, i) => {
  const angle = i * Math.PI * 2 / (teeth * 4); const r = i % 4 < 2 ? radius : radius - 6;
  return `${i ? 'L' : 'M'}${(Math.cos(angle) * r).toFixed(2)},${(Math.sin(angle) * r).toFixed(2)}`;
}).join(' ') + 'Z';
const gearPath = points(44, 18);
const nodes = [
  { key: 'demand', label: ['DEMAND'], icon: TrendingUp }, { key: 'newCustomers', label: ['CUSTOMER', 'ACQUISITION'], icon: Megaphone },
  { key: 'customers', label: ['CUSTOMERS'], icon: Users }, { key: 'volume', label: ['VALUE', 'DELIVERED'], icon: Package },
  { key: 'revenue', label: ['REVENUE'], icon: TrendingUp }, { key: 'grossProfit', label: ['GROSS', 'PROFIT'], icon: Coins },
  { key: 'operatingProfit', label: ['OPERATING', 'PROFIT'], icon: Coins }, { key: 'freeCashFlow', label: ['FREE CASH', 'FLOW'], icon: Coins },
  { key: 'availableCapital', label: ['CAPITAL'], icon: Layers }, { key: 'investment', label: ['INVESTMENT'], icon: Zap },
  { key: 'productiveCapacity', label: ['PRODUCTIVE', 'CAPACITY'], icon: Factory }, { key: 'productivity', label: ['PRODUCT /', 'SERVICE'], icon: Package },
  { key: 'retention', label: ['CUSTOMER', 'VALUE'], icon: Heart }, { key: 'brand', label: ['COMPETITIVE', 'ADVANTANTAGE'], icon: Trophy },
];
function Hit({ label, onClick, children, ...props }: React.SVGProps<SVGGElement> & { label: string; onClick: () => void }) {
  return <g {...props} role="button" tabIndex={0} aria-label={`Inspect ${label}`} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }} className={`machine-hit ${props.className || ''}`}><title>{label} · click to inspect formula and source</title>{children}</g>;
}
export default function Machine({ state: s, baseline: b, view: v, motion, inspect, compact, cascade }: Props) {
  const id = useId().replace(/:/g, ''); const f = (name: string) => `url(#${id}-${name})`;
  const wheel = useRef<SVGGElement>(null); const gearEls = useRef<(SVGGElement | null)[]>([]); const rpm = useRef(0);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0, last = 0, angle = 0;
    const animate = (time: number) => {
      const dt = last ? Math.min(.1, (time - last) / 1000) : 0; last = time;
      rpm.current += (v.speed - rpm.current) * Math.min(1, dt * 2);
      angle = (angle + rpm.current * 6 * dt) % 360;
      wheel.current?.setAttribute('transform', `rotate(${angle} 465 290)`);
      gearEls.current.forEach((el, i) => el?.setAttribute('transform', `rotate(${angle * (i % 2 ? -1 : 1) * v.gearSpeed / Math.max(1, v.speed)})`));
      frame = requestAnimationFrame(animate);
    }; frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame);
  }, [motion, v.speed, v.gearSpeed]);
  const commonPipes = 'M42 94H152Q171 94 171 113V215H239 M42 143H123Q145 143 145 170V433Q145 464 176 464H271 M594 474H775V334H912V268H824 M662 192H725V64H959V257 M800 487H961V427 M349 485V544H771V500';
  return <div className={`machine-frame ${compact ? 'compact' : ''} ${v.stress ? 'under-stress' : ''} ${cascade ? 'cascade-active' : ''}`} style={{ '--flow-time': `${v.flowDuration}s`, '--brake': v.brake } as CSSProperties}>
    {!compact && <div className="machine-tools"><span>PLATE 01 / ECONOMIC ENGINE</span><div><button onClick={() => setZoom(Math.max(1, zoom - .25))} aria-label="Zoom out">−</button><button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button onClick={() => setZoom(Math.min(2.5, zoom + .25))} aria-label="Zoom in">+</button></div></div>}
    <div className="machine-pan"><svg className={`machine ${!motion ? 'motion-paused' : ''}`} viewBox="0 0 1050 660" style={{ width: `${zoom * 100}%` }} role="group" aria-label="Interactive Going Concern Machine">
      <defs>
        <linearGradient id={`${id}-metal`} x2="1" y2="1"><stop stopColor="var(--n10)"/><stop offset=".18" stopColor="var(--n6)"/><stop offset=".35" stopColor="var(--n9)"/><stop offset=".5" stopColor="var(--n7)"/><stop offset=".54" stopColor="var(--n11)"/><stop offset=".75" stopColor="var(--n5)"/><stop offset="1" stopColor="var(--n8)"/></linearGradient>
        <linearGradient id={`${id}-brass`}><stop stopColor="var(--accent1)"/><stop offset=".24" stopColor="var(--accent2)"/><stop offset=".45" stopColor="var(--n8)"/><stop offset=".64" stopColor="var(--accent2)"/><stop offset="1" stopColor="var(--accent1)"/></linearGradient>
        <linearGradient id={`${id}-dark`}><stop stopColor="var(--n1)"/><stop offset=".4" stopColor="var(--n5)"/><stop offset=".6" stopColor="var(--n2)"/><stop offset="1" stopColor="var(--n6)"/></linearGradient>
        <linearGradient id={`${id}-glass`}><stop stopColor="var(--n7)" stopOpacity=".35"/><stop offset=".3" stopColor="var(--n10)" stopOpacity=".1"/><stop offset=".5" stopColor="var(--n11)" stopOpacity=".7"/><stop offset=".8" stopColor="var(--n9)" stopOpacity=".08"/><stop offset="1" stopColor="var(--n2)" stopOpacity=".4"/></linearGradient>
        <radialGradient id={`${id}-face`}><stop stopColor="var(--n11)"/><stop offset=".8" stopColor="var(--n9)"/><stop offset="1" stopColor="var(--n7)"/></radialGradient>
        <filter id={`${id}-shadow`} x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="var(--n1)" floodOpacity=".35"/></filter>
        <pattern id={`${id}-brush`} width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 1H3" stroke="var(--n12)" opacity=".16"/></pattern>
      </defs>
      <g fill="none" strokeLinejoin="round"><path d={commonPipes} stroke="var(--n2)" strokeWidth="17"/><path d={commonPipes} stroke={f('brass')} strokeWidth="12"/><path d={commonPipes} className={`cash-stream ${v.loss ? 'loss' : ''}`} style={{ animationPlayState: !motion || Math.abs(s.freeCashFlow) < 1 ? 'paused' : 'running' }}/></g>
      {[[145,361],[171,140],[775,387],[912,312],[959,142],[370,544],[692,544],[145,199]].map(([x,y]) => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}><rect x="-12" y="-8" width="24" height="16" rx="2" fill={f('metal')} stroke="var(--n2)"/><path d="M-8-8V8M8-8V8" stroke="var(--n3)"/></g>)}
      <g transform="translate(20 25)"><rect width="176" height="29" className="blue-plate"/><text x="88" y="18" textAnchor="middle" className="white-label">EXTERNAL ECONOMIC VALUE</text><text x="6" y="61">Market need</text><text x="6" y="83">Willingness to pay</text><text x="6" y="105">Purchasing power</text><text x="6" y="145" className="small-label">THE MACHINE NEEDS</text><text x="6" y="160" className="small-label">EXTERNAL VALUE TO RUN.</text></g>
      <circle cx="465" cy="290" r="240" fill="color-mix(in srgb,var(--n6) 13%,transparent)" stroke="var(--n6)" strokeWidth="2"/>
      <circle cx="465" cy="290" r="168" fill="none" stroke="var(--n2)" strokeWidth="16"/><circle cx="465" cy="290" r="168" fill="none" stroke="var(--sec2)" strokeWidth="6" strokeDasharray="43 12"/>
      <g className="flywheel-housing" filter={f('shadow')}><circle cx="465" cy="290" r="146" fill={f('metal')} stroke="var(--n2)" strokeWidth="3"/><circle cx="465" cy="290" r="135" fill={f('dark')} stroke="var(--n8)" strokeWidth="3"/>
        <g ref={wheel}><circle cx="465" cy="290" r="122" fill={f('metal')} stroke="var(--n6)" strokeWidth="3"/>
          {Array.from({length:8},(_,i)=><path key={i} d="M454 170L459 227H471L476 170Z" transform={`rotate(${i*45} 465 290)`} fill={f('dark')} stroke="var(--n7)"/>)}
          {[91,96,103,111,119].map((r,i)=><circle key={r} cx="465" cy="290" r={r} fill="none" stroke={i%2?'var(--n8)':'var(--n4)'} strokeWidth="1"/>)}
          <circle cx="465" cy="171" r="3" fill="var(--accent3)"/>
        </g>
        <Hit label="Business momentum" onClick={()=>inspect('businessMomentum')}><circle cx="465" cy="290" r="72" fill={f('face')} stroke="var(--n4)" strokeWidth="3"/><text x="465" y="265" textAnchor="middle" className="wheel-title">GOING</text><text x="465" y="289" textAnchor="middle" className="wheel-title">CONCERN</text><text x="465" y="310" textAnchor="middle" className="small-label">BUSINESS MOMENTUM</text><text x="465" y="333" textAnchor="middle" className="momentum-value">{s.businessMomentum > 0 ? '+' : ''}{s.businessMomentum.toFixed(1)}</text></Hit>
      </g>
      {nodes.map((n,i)=>{ const angle=(-169+i*360/nodes.length)*Math.PI/180; const x=465+219*Math.cos(angle),y=290+219*Math.sin(angle); const Icon=n.icon; return <Hit key={n.key} label={n.label.join(' ')} onClick={()=>inspect(n.key)} transform={`translate(${x} ${y})`} className={`gear-node node-${i}`}>
        <g filter={f('shadow')}><g ref={el=>{gearEls.current[i]=el;}}><path d={gearPath} fill={f('metal')} stroke="var(--n2)" strokeWidth="2"/></g><circle r="34" fill={f('face')} stroke="var(--n5)" strokeWidth="2"/><circle r="30" fill="none" stroke="var(--n7)"/></g>
        <Icon x={-10} y={-23} width={20} height={20} strokeWidth={1.8} color="var(--n2)"/>{n.label.map((line,j)=><text key={line} textAnchor="middle" y={10+j*11} className="gear-label">{line.replace('ADVANTANTAGE','ADVANTAGE')}</text>)}
      </Hit>})}
      <g transform="translate(21 240)"><rect width="167" height="24" className="blue-plate"/><text x="83" y="16" className="white-label" textAnchor="middle">PRODUCTIVE ASSET STOCKS</text>
        {(Object.keys(stockLabels) as StockKey[]).map((k,i)=><Hit key={k} label={stockLabels[k]} onClick={()=>inspect(k)} transform={`translate(0 ${36+i*28})`}><text x="3" y="0" className="asset-label">{stockLabels[k]}</text><rect x="3" y="5" width="152" height="6" fill="var(--n7)"/><rect x="3" y="5" width={76*v.stocks[k]} height="6" fill="var(--n4)"/></Hit>)}
        <text x="3" y="276" className="tiny-label">MODELED STOCKS · INDEXED TO YEAR 0</text>
      </g>
      <Hit label="Economic conversion engine" onClick={()=>inspect('operatingCashFlow')} transform="translate(753 152)">
        <g filter={f('shadow')}><ellipse cx="59" cy="0" rx="66" ry="17" fill={f('metal')} stroke="var(--n3)" strokeWidth="3"/><rect width="118" height="172" fill={f('metal')} stroke="var(--n3)" strokeWidth="3"/><rect x="10" y="11" width="98" height="150" fill={f('face')} stroke="var(--n5)"/><path d="M-6 5V166M124 5V166" stroke={f('brass')} strokeWidth="8"/><ellipse cx="59" cy="173" rx="66" ry="12" fill={f('metal')} stroke="var(--n3)" strokeWidth="3"/></g>
        <text x="59" y="35" textAnchor="middle" className="engine-label">ECONOMIC</text><text x="59" y="50" textAnchor="middle" className="engine-label">CONVERSION</text><text x="59" y="65" textAnchor="middle" className="engine-label">ENGINE</text><path d="M21 78H97" stroke="var(--n6)"/><text x="22" y="96" className="small-label">Revenue</text><text x="22" y="112" className="small-label">− Cost to deliver</text><text x="22" y="128" className="small-label">− Operating costs</text><text x="22" y="144" className="small-label">− Tax / interest</text>
        <text x="59" y="205" textAnchor="middle" className="metric-value">{money(s.freeCashFlow,b.currency)}</text><text x="59" y="222" textAnchor="middle" className="small-label">FREE CASH FLOW / YEAR</text>
      </Hit>
      <Hit label="Cash reserve" onClick={()=>inspect('cash')} transform="translate(925 264)">
        <g filter={f('shadow')}><rect x="-8" y="-6" width="84" height="137" rx="17" fill={f('dark')} stroke="var(--n2)"/><rect width="68" height="120" fill="var(--n9)"/><rect x="3" y={118-v.fill*114} width="62" height={v.fill*114} fill="var(--accent2)"/>
        {Array.from({length:10},(_,i)=><circle key={i} className="cash-bubble" cx={10+i*17%48} cy={119-v.fill*(14+i*9)} r={1+i%2} fill="var(--n9)" style={{animationDelay:`${i*.3}s`}}/>)}
        <rect width="68" height="120" fill={f('glass')}/><path d="M2 0V125M66 0V125" stroke={f('metal')} strokeWidth="5"/><ellipse cx="34" cy="2" rx="38" ry="8" fill={f('metal')} stroke="var(--n3)"/><ellipse cx="34" cy="122" rx="38" ry="8" fill={f('metal')} stroke="var(--n3)"/>
        <rect x="-13" y="142" width="96" height="61" fill={f('face')} stroke="var(--n4)"/></g><text x="34" y="160" textAnchor="middle" className="small-label">CASH RESERVE</text><text x="34" y="185" textAnchor="middle" className="metric-value">{money(s.cash,b.currency)}</text>
      </Hit>
      <Hit label="Available capital" onClick={()=>inspect('availableCapital')} transform="translate(748 421)"><g filter={f('shadow')}><rect width="135" height="81" rx="3" fill={f('metal')} stroke="var(--n3)" strokeWidth="3"/><rect x="12" y="12" width="29" height="57" fill="var(--n2)" stroke="var(--n7)"/>{Array.from({length:6},(_,i)=><rect key={i} x="16" y={16+i*8} width="21" height="6" fill={i>=6-v.charge*6?'var(--n5)':'var(--n3)'}/>)}<text x="87" y="27" textAnchor="middle" className="small-label">AVAILABLE</text><text x="87" y="41" textAnchor="middle" className="small-label">CAPITAL</text><text x="87" y="63" textAnchor="middle" className="capital-value">{money(s.availableCapital,b.currency)}</text></g></Hit>
      <path d="M338 393Q465 496 592 393" stroke="var(--accent1)" strokeWidth={7+v.brake*10} fill="none"/><path d="M408 440V575M521 440V575" stroke={f('dark')} strokeWidth="9"/>
      <g transform="translate(24 574)"><rect width="995" height="12" fill={f('metal')} stroke="var(--n4)"/><text x="497" y="-12" textAnchor="middle" className="engine-label">SYSTEM FRICTION / THE FORCES OF DECAY</text>
        {['Competition','Customer churn','Depreciation','Obsolescence','Interest','Taxation','Complexity','Talent loss'].map((n,i)=><Hit key={n} label={n} onClick={()=>inspect(i===1?'churnRate':i===4?'interestExpense':'friction')} transform={`translate(${i*124+14} 0)`}><rect x="27" y="-4" width="36" height="25" rx="4" fill={f('dark')} stroke="var(--n3)"/><rect x="40" y="-6" width="10" height="28" fill="var(--warn1)"/><path d="M23 0V19M67 0V19" stroke="var(--n7)" strokeWidth="3"/><text x="45" y="40" textAnchor="middle" className="brake-label">{n.toUpperCase()}</text><path d="M8 49H84" stroke="var(--n5)" strokeWidth="2"/></Hit>)}
      </g>
      <g transform="translate(355 365)"><rect width="220" height="28" rx="3" fill={f('face')} stroke="var(--n4)"/><text x="110" y="19" textAnchor="middle" className={`status-label ${v.stress?'negative':''}`}>{v.status}</text></g>
      <text x="774" y="541" textAnchor="middle" className="small-label">{v.liquidity}</text>
    </svg></div>
  </div>;
}
