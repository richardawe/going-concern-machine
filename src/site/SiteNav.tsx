import { useEffect, useState } from 'react';
import { Menu, Monitor, Moon, Sun, X } from 'lucide-react';
import { useThemeMode, type Mode } from '../components/ThemeSwitch';
import './site.css';

/** True on the platform server (which can sign people in); false on the static GitHub Pages copy. */
export const onPlatform = () => typeof document !== 'undefined' && !!document.querySelector('meta[name="gcm-host"]');
const base = import.meta.env.BASE_URL;
export const staticPage = (path: string) => `${base}${path}`;

/** The company behind Going Concern Lab, as registered at Companies House. Shown in footers and the privacy notice. */
export const COMPANY = { name: '3D7 Technologies Ltd', number: '09785441', address: '02 Universal Square, Devonshire Street North, Manchester, England, M12 6JH', email: 'Richard.Awe@3d7tech.com' };

export type Section = 'home' | 'machine' | 'ceo' | 'live' | 'course' | 'universities' | 'credits';
const links: [Section, string, string][] = [
  ['home', 'Home', '#/'], ['machine', 'Company machine', '#/machine'], ['ceo', 'CEO mode', '#/ceo'], ['live', 'Live 3D', '#/live'],
  ['universities', 'For universities', staticPage('universities/')],
];

export function ThemeIcons() {
  const [mode, setMode] = useThemeMode();
  const opts: [Mode, string, string, typeof Sun][] = [['system', 'System', 'Follow my device', Monitor], ['light', 'Light', 'Light', Sun], ['dark', 'Dark', 'Dark', Moon]];
  return <div className="site-theme" role="group" aria-label="Colour theme">{opts.map(([m, label, title, Icon]) =>
    <button key={m} type="button" title={title} aria-label={`${label} theme`} aria-pressed={mode === m} onClick={() => setMode(m)}><Icon size={14} /></button>)}</div>;
}

export default function SiteNav({ current }: { current: Section }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { const close = () => setOpen(false); addEventListener('hashchange', close); return () => removeEventListener('hashchange', close); }, []);
  return <nav className={`site-nav ${open ? 'open' : ''}`} aria-label="Site">
    <div className="site-nav-inner">
      <a className="site-logo" href="#/"><i aria-hidden="true" />Going Concern Lab</a>
      <div className="site-links">{links.map(([key, label, href]) =>
        <a key={key} href={href} aria-current={current === key ? 'page' : undefined}>{label}</a>)}
        <div className="site-menu-extra"><ThemeIcons />{onPlatform() && <a href="/sign-in">Sign in</a>}</div></div>
      <div className="site-actions">
        <ThemeIcons />
        {onPlatform() && <a className="site-btn" href="/sign-in">Sign in</a>}
        <a className="site-btn primary" href="#/machine">Start exploring →</a>
      </div>
      <button className="site-burger" type="button" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(v => !v)}>{open ? <X size={18} /> : <Menu size={18} />}</button>
    </div>
  </nav>;
}

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-footer-cols">
      <div><a className="site-logo" href="#/"><i aria-hidden="true" />Going Concern Lab</a><p>A business is a machine that must keep capturing value to keep running. We make that machine visible.</p></div>
      <div><h4>Product</h4><a href="#/machine">Company machine</a><a href="#/ceo">CEO mode</a><a href="#/live">Live 3D company</a><a href={staticPage('universities/')}>Going Concern Modules</a><a href="#/machine/build">Build your own business</a><a href={staticPage('demo/')}>Demo video</a></div>
      <div><h4>Universities</h4><a href={staticPage('universities/')}>University edition</a>{onPlatform() && <a href="/sign-in">University sign-in</a>}<a href={`${staticPage('universities/')}#contact`}>Contact form</a><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></div>
      <div><h4>About</h4><a href="#/credits">Drawings and credits</a>{onPlatform() && <><a href="/legal/privacy">Privacy</a><a href="/legal/accessibility">Accessibility</a></>}</div>
    </div>
    <div className="site-legal"><span>Going Concern Lab is a product of {COMPANY.name} (company no. {COMPANY.number}). © {new Date().getFullYear()} {COMPANY.name}.</span><span>A teaching and analysis tool. Not financial advice or a forecast of any real company. Drawings: Historic American Engineering Record and Diderot's <i>Encyclopédie</i>, public domain.</span></div>
  </footer>;
}
