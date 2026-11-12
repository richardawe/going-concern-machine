import { useEffect } from 'react';
import { COMPANY } from '../site/SiteNav';
import { Shell } from './ui';

// Privacy notice and accessibility statement. DRAFTS: have them reviewed (the privacy notice by someone qualified in
// UK GDPR) before the first university goes live. The processors listed must match what production really uses
// (Liquid Web, Cloudflare, Brevo; fonts are self-hosted in public/fonts, so Google is not one):
// add the off-site backup storage here when RESTIC_REPOSITORY is set (docs/DEPLOYMENT.md, section 6).

export default function Legal({ page }: { page: string }) {
  useEffect(() => { document.title = `${page === 'accessibility' ? 'Accessibility' : 'Privacy'} · Going Concern Lab`; }, [page]);
  return <Shell lab brand="Legal" crest="G" nav={[{ to: '/legal/privacy', label: 'Privacy', active: page === 'privacy' }, { to: '/legal/accessibility', label: 'Accessibility', active: page === 'accessibility' }]}>
    <article className="legal stack">{page === 'accessibility' ? <Accessibility /> : <Privacy />}</article>
  </Shell>;
}

function Privacy() {
  const mail = <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>;
  return <>
    <span className="eyebrow">Privacy notice · draft</span>
    <h1>How Going Concern Lab uses your information</h1>
    <p>Going Concern Lab is a product of <b>{COMPANY.name}</b>, company number {COMPANY.number}, registered in England and Wales. Registered office: {COMPANY.address}. Contact: {mail}.</p>
    <h2>Who is responsible for your information</h2>
    <ul className="list">
      <li><b>On the public site</b> (goingconcernlab.com, including the company machine, CEO mode and the contact form), {COMPANY.name} is the <b>controller</b>: we decide how this information is used.</li>
      <li><b>On a university’s Going Concern Lab</b> (its own address, such as <i>university</i>.goingconcernlab.com), your university decides to use it and why, so it is the <b>controller</b>. {COMPANY.name} is its <b>processor</b>: we use students’ and lecturers’ information only to run the courses, on the university’s instructions.</li>
    </ul>
    <h2>What we hold</h2>
    <p><b>If you sign in through your university:</b></p>
    <ul className="list"><li>Your university email address, your name and, if you give it, your student ID.</li><li>The courses you join, your answers and decisions in each module, and what you hand in, with the time and its verification code.</li><li>When and from which device and network (IP address and browser) you signed in, to keep your account secure.</li></ul>
    <p><b>If you use the contact form or email us:</b> your name, email address, university, role and message. We use them to answer you and to arrange a pilot, because we have a legitimate interest in replying to people who contact us.</p>
    <p><b>If you use the public tools</b> without signing in, your work and settings stay in your own browser and are never sent to us.</p>
    <h2>Where it is kept, and for how long</h2>
    <p>On Liquid Web servers in the United States, with nightly backups on the same servers. Your work is kept for the period your university has set after each course ends (12 months unless your university chose otherwise), then deleted. Sign-in records are kept for 90 days. Messages from the contact form are kept in our mailbox only as long as we need them to deal with your enquiry.</p>
    <p>Because our servers and some of the services below are outside the UK, your information is transferred abroad. We only use providers that protect it with the safeguards UK data protection law requires, such as the UK International Data Transfer Agreement or Addendum, or the UK Extension to the EU–US Data Privacy Framework.</p>
    <h2>Who else sees it</h2>
    <p>On a university’s Going Concern Lab, your lecturers and your university’s Going Concern Lab administrators. These services help us run Going Concern Lab and handle some information on our behalf:</p>
    <ul className="list">
      <li><b>Liquid Web, L.L.C.</b> (United States): the servers that run Going Concern Lab, its database and its backups, and our email mailbox. They hold everything listed above, including contact-form messages.</li>
      <li><b>Cloudflare, Inc.</b> (United States, with servers worldwide): network protection and secure connections. Every visit passes through it, including your IP address, browser details, the pages you open and your sign-in cookie.</li>
      <li><b>Brevo</b> (Sendinblue SAS, France, EU): sends sign-in codes, invitations, hand-in receipts and contact-form messages. It handles the recipient’s email address and the content of each email.</li>
    </ul>
    <p>We use no analytics, tracking or advertising services, and the site’s fonts are served from our own servers. We never sell your information or use it for advertising.</p>
    <h2>Cookies</h2>
    <p>One cookie keeps you signed in. It is strictly necessary, so we don’t ask for consent. There are no analytics or advertising cookies. The public tools save your progress and colour theme in your browser’s storage, on your device only.</p>
    <h2>Your rights</h2>
    <p>You can ask for a copy of your information, or to have it corrected or deleted, and you can object to how we use it. If you sign in through your university, you can download everything we hold about you from your Account page; for anything else about that information, contact your university’s data protection officer first, as your university is its controller. For the public site and the contact form, contact us at {mail}, or write to {COMPANY.name}, {COMPANY.address}. You can also complain to the Information Commissioner’s Office (ico.org.uk).</p>
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
    <p>Email <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. We reply within 5 working days. If you’re not happy with our response, contact the Equality Advisory and Support Service (EASS).</p>
  </>;
}
