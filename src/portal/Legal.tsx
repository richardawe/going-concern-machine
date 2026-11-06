import { useEffect } from 'react';
import { Shell } from './ui';

// Privacy notice and accessibility statement. DRAFTS: have them reviewed (the privacy notice by someone qualified in
// UK GDPR) and fill in the bracketed details before the first university goes live.

export default function Legal({ page }: { page: string }) {
  useEffect(() => { document.title = `${page === 'accessibility' ? 'Accessibility' : 'Privacy'} · Going Concern Lab`; }, [page]);
  return <Shell lab brand="Legal" crest="G" nav={[{ to: '/legal/privacy', label: 'Privacy', active: page === 'privacy' }, { to: '/legal/accessibility', label: 'Accessibility', active: page === 'accessibility' }]}>
    <article className="legal stack">{page === 'accessibility' ? <Accessibility /> : <Privacy />}</article>
  </Shell>;
}

function Privacy() {
  return <>
    <span className="eyebrow">Privacy notice · draft</span>
    <h1>How Going Concern Lab uses your information</h1>
    <p>Going Concern Lab provides strategic finance modules to universities. Your university decides to use it and why, so it is the <b>controller</b> of your information. Going Concern Lab (<i>[legal name, company number, registered address]</i>) is its <b>processor</b>: we use your information only to run the courses, on your university’s instructions.</p>
    <h2>What we hold</h2>
    <ul className="list"><li>Your university email address, your name and, if you give it, your student ID.</li><li>The courses you join, your answers and decisions in each module, and what you hand in, with the time and its verification code.</li><li>When and from which device and network you signed in, to keep your account secure.</li></ul>
    <h2>Where it is kept, and for how long</h2>
    <p>On servers in the United Kingdom, with encrypted backups also in the UK. Your work is kept for the period your university has set after each course ends (12 months unless your university chose otherwise), then deleted. Sign-in records are kept for 90 days.</p>
    <h2>Who else sees it</h2>
    <p>Your lecturers and your university’s Going Concern Lab administrators. These services help us run Going Concern Lab and handle some of your information on our behalf: <i>[hosting provider]</i> (servers), Cloudflare (network protection), Brevo (sign-in and receipt emails), and <i>[backup storage provider]</i>. We never sell your information or use it for advertising.</p>
    <h2>Cookies</h2>
    <p>One cookie keeps you signed in. It is strictly necessary, so we don’t ask for consent. There are no analytics or advertising cookies.</p>
    <h2>Your rights</h2>
    <p>You can download everything we hold about you from your Account page. To correct or delete information, or to complain, contact your university’s data protection officer first. You can also contact us at <i>[privacy@your-domain]</i>, or the Information Commissioner’s Office (ico.org.uk).</p>
  </>;
}

function Accessibility() {
  return <>
    <span className="eyebrow">Accessibility statement · draft</span>
    <h1>Accessibility</h1>
    <p>We want everyone who uses Going Concern Lab to be able to complete their modules. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.</p>
    <h2>What you can do</h2>
    <ul className="list"><li>Use the whole site with a keyboard alone.</li><li>Zoom to 200% without losing content.</li><li>Use light or dark mode, or follow your device’s setting.</li><li>Use a screen reader for sign-in, courses, answers and handing in.</li></ul>
    <h2>Known limits</h2>
    <p>The animated module figures are being reviewed for screen readers. Every number a figure shows is also given in the text beside it. <i>[Update after the WCAG 2.2 AA audit planned before launch.]</i></p>
    <h2>Tell us about a problem</h2>
    <p>Email <i>[accessibility@your-domain]</i>. We reply within 5 working days. If you’re not happy with our response, contact the Equality Advisory and Support Service (EASS).</p>
  </>;
}
