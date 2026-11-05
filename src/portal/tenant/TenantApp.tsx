import { useEffect } from 'react';
import { api } from '../api';
import { match, navigate, query, usePath } from '../router';
import SignIn from '../SignIn';
import { Loading, Notice, Shell, type NavItem } from '../ui';
import type { Context } from '../PortalApp';
import { Account, Profile } from './account';
import { Activity, AdminOverview, People, SettingsPage, Terms } from './admin';
import { CoursePages, JoinPage, MyCourses } from './student';
import { CourseForm, CourseRoster, StudentWorkPage, TeachCourses } from './teach';

// A university's portal at <slug>.<domain>. Students see their courses; lecturers also teach; admins also manage.

export interface Me { id: string; email: string; name: string; studentId: string; role: 'student' | 'lecturer' | 'admin' }
const JOIN_KEY = 'gcm:portal:join';

export default function TenantApp({ ctx, reload }: { ctx: Context; reload: () => void }) {
  const path = usePath(), t = ctx.tenant!, me = ctx.user as Me | null;
  const initials = t.name.replace(/^(The |University of )/, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  useEffect(() => { document.title = `${t.name} · Going Concern`; }, [t.name]);

  // Remember a join link opened before signing in, and use it straight after.
  const join = match('/join/:code', path);
  useEffect(() => { if (join && !me) try { sessionStorage.setItem(JOIN_KEY, join.code); } catch { /* ignore */ } }, [join?.code, me]);
  useEffect(() => {
    if (!me) return;
    let pending: string | null = null; try { pending = sessionStorage.getItem(JOIN_KEY); sessionStorage.removeItem(JOIN_KEY); } catch { /* ignore */ }
    if (pending && !join) navigate(`/join/${pending}`, { replace: true });
  }, [me?.id]);

  const shell = (nav: NavItem[], body: React.ReactNode) => <Shell brand="GOING CONCERN · MODULES" place={t.name} crest={initials} color={t.brandColor} nav={nav} who={me?.email}
    role={me && me.role !== 'student' ? me.role[0].toUpperCase() + me.role.slice(1) : undefined}
    onSignOut={me ? () => void api('/api/auth/sign-out', { body: {} }).then(() => { navigate('/'); reload(); }) : undefined}>{body}</Shell>;

  if (!t.open) return shell([], <Notice kind="warn">{t.name}’s access to Going Concern is paused. If you think this is a mistake, contact your university’s administrator.</Notice>);
  if (!me) return shell([], <SignIn title={<><span className="crest big" aria-hidden="true">{initials}</span><h1>{t.name}</h1><p className="muted">Strategic finance modules</p></>}
    emailLabel={`Your ${t.name} email`} placeholder={t.domains.map(d => `name@${d.domain}`).slice(0, 2).join(' or ')}
    initialEmail={query('email') ?? ''} codeUrl="/api/auth/code" verifyUrl="/api/auth/verify" onSignedIn={() => { reload(); if (path === '/sign-in') navigate('/', { replace: true }); }}
    footer={<p className="small muted center">At a different university? <a href={`${location.protocol}//${ctx.baseDomain}${location.port ? `:${location.port}` : ''}/sign-in`}>Find your university</a></p>} />);
  if (!me.name.trim()) return shell([], <div className="narrow"><Profile me={me} university={t.name} onSaved={reload} welcome /></div>);

  const staff = me.role !== 'student', isAdmin = me.role === 'admin';
  const nav: NavItem[] = [
    staff ? { to: '/teach', label: 'Teaching', active: path === '/' || path.startsWith('/teach') } : { to: '/', label: 'My courses', active: path === '/' || path.startsWith('/courses') },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', active: path.startsWith('/admin') }] : []),
    { to: '/account', label: 'Account', active: path === '/account' },
  ];
  const deny = <Notice kind="error">You don’t have access to this page.</Notice>;
  let m: Record<string, string> | null;
  let page: React.ReactNode;
  if (path === '/' || path === '/sign-in') page = staff && path === '/' ? <TeachCourses /> : <MyCourses me={me} />;
  else if (join) page = <JoinPage code={join.code} />;
  else if ((m = match('/courses/:id', path))) page = <CoursePages me={me} courseId={m.id} view="home" />;
  else if ((m = match('/courses/:id/m/:module', path))) page = <CoursePages me={me} courseId={m.id} view="module" moduleId={m.module} />;
  else if ((m = match('/courses/:id/hand-in', path))) page = <CoursePages me={me} courseId={m.id} view="hand-in" />;
  else if (path === '/account') page = <Account me={me} university={t.name} onSaved={reload} />;
  else if (path.startsWith('/teach') && !staff) page = deny;
  else if (path === '/teach') page = <TeachCourses />;
  else if (path === '/teach/new') page = <CourseForm />;
  else if ((m = match('/teach/:id', path))) page = <CourseRoster id={m.id} />;
  else if ((m = match('/teach/:id/edit', path))) page = <CourseForm id={m.id} />;
  else if ((m = match('/teach/:id/students/:userId', path))) page = <StudentWorkPage courseId={m.id} userId={m.userId} />;
  else if (path.startsWith('/admin') && !isAdmin) page = deny;
  else if (path.startsWith('/admin') && !t.termsAccepted) page = <Terms university={t.name} onAccepted={reload} />;
  else if (path === '/admin') page = <AdminOverview university={t.name} />;
  else if (path === '/admin/people') page = <People meId={me.id} />;
  else if (path === '/admin/settings') page = <SettingsPage onChanged={reload} from={ctx.emailFrom ?? ''} />;
  else if (path === '/admin/activity') page = <Activity />;
  else page = <Notice kind="error">There’s no page here. <a href="/">Go to the start</a></Notice>;
  return shell(nav, page ?? <Loading />);
}
