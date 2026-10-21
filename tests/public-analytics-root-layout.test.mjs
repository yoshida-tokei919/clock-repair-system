import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const policySource = readFileSync(join(process.cwd(), 'src/lib/public-analytics.ts'), 'utf8');
const policyJavaScript = ts.transpileModule(policySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  PUBLIC_ANALYTICS_TITLES,
  isLineConsultationHref,
  publicAnalyticsPayload,
} = await import(`data:text/javascript,${encodeURIComponent(policyJavaScript)}`);

const app = join(process.cwd(), 'src/app');

function pages(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === 'page.tsx' ? [relative(app, path).replaceAll('\\', '/')] : [];
  });
}

function urlOf(file) {
  const parts = file.split('/').slice(1, -1).filter((part) => !/^\(.+\)$/.test(part));
  return '/' + parts.join('/');
}

test('each page has exactly one unchanged URL and the correct root', () => {
  const allPages = pages(app);
  assert.equal(allPages.some((file) => !file.startsWith('(public)/') && !file.startsWith('(private)/')), false);
  const urls = allPages.map(urlOf);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.includes('/'), true);
  for (const path of Object.keys(PUBLIC_ANALYTICS_TITLES)) {
    const file = `(public)${path === '/' ? '' : path}/page.tsx`;
    assert.equal(allPages.includes(file), true, file);
  }
  for (const route of [
    '/cases/gallery/[id]', '/cases/biz', '/cases/biz/[id]', '/cases/biz/login',
    '/customer/repairs/[token]', '/customer/intake/[token]', '/customer/delivery/[token]',
    '/customer/invoices/[token]', '/login', '/customers', '/documents/estimate/[id]',
    '/mobile/repairs/[id]/upload', '/line-users', '/reports/status',
  ]) assert.equal(allPages.includes(`(private)${route}/page.tsx`), true, route);
  assert.equal(allPages.includes('(private)/(app)/repairs/[id]/page.tsx'), true);
  assert.deepEqual(allPages.filter((file) => file.startsWith('(public)/')).map(urlOf).sort(),
    Object.keys(PUBLIC_ANALYTICS_TITLES).sort());
});

test('separate html/body roots guarantee document navigation and private root has no tag', () => {
  const publicLayout = readFileSync(join(app, '(public)/layout.tsx'), 'utf8');
  const privateLayout = readFileSync(join(app, '(private)/layout.tsx'), 'utf8');
  assert.equal(readFileSync(join(app, '(public)/cases/layout.tsx'), 'utf8'),
    readFileSync(join(app, '(private)/cases/layout.tsx'), 'utf8'));
  for (const layout of [publicLayout, privateLayout]) {
    assert.match(layout, /<html lang="ja">/);
    assert.match(layout, /<body /);
  }
  assert.match(publicLayout, /<PublicAnalytics \/>/);
  assert.doesNotMatch(privateLayout, /PublicAnalytics|googletagmanager|gtag/);
  assert.match(privateLayout, /<QRScannerListener \/>/);
  assert.match(privateLayout, /<Providers>/);
  assert.match(privateLayout, /<Toaster \/>/);
  assert.equal(readdirSync(app).includes('layout.tsx'), false);
});

test('only fixed public paths produce sanitized GA4 payloads', () => {
  const origin = 'https://yoshidawatchrepair.com';
  assert.deepEqual(publicAnalyticsPayload('/', origin), {
    page_location: `${origin}/`, page_path: '/', page_title: '時計修理・オーバーホール', page_referrer: '',
  });
  assert.deepEqual(publicAnalyticsPayload('/cases/gallery', origin), {
    page_location: `${origin}/cases/gallery`, page_path: '/cases/gallery',
    page_title: '修理事例ギャラリー', page_referrer: '',
  });
  for (const path of ['/cases/gallery/123', '/cases/biz', '/customer/repairs/secret',
    '/login', '/repairs/12', '/line-users', '/cases/gallery?name=x', '/about-technician#token']) {
    assert.equal(publicAnalyticsPayload(path, origin), null, path);
  }
  assert.equal(publicAnalyticsPayload('/', 'https://example.com/?token=secret'), null);
  assert.equal(publicAnalyticsPayload('/cases/gallery', origin, '?email=private@example.com', ''), null);
  assert.equal(publicAnalyticsPayload('/repair-flow', origin, '', '#private-token'), null);
  const analyticsComponent = readFileSync(join(process.cwd(), 'src/components/analytics/PublicAnalytics.tsx'), 'utf8');
  assert.match(analyticsComponent, /script\.referrerPolicy\s*=\s*"no-referrer"/);
  assert.match(analyticsComponent, /history\.pushState\s*=\s*guardHistory/);
  assert.match(analyticsComponent, /history\.replaceState\s*=\s*guardHistory/);
  assert.match(analyticsComponent, /ga-disable-\$\{GA4_MEASUREMENT_ID\}/);
  assert.match(analyticsComponent, /addEventListener\("popstate", onHistoryNavigation, true\)/);
});

test('LINE clicks recognize only HTTPS LINE hosts', () => {
  assert.equal(isLineConsultationHref('https://lin.ee/3C0XfJW'), true);
  assert.equal(isLineConsultationHref('https://line.me/R/ti/p/foo'), true);
  for (const href of ['https://evil-line.me/x', 'https://line.me.evil.test/x',
    'http://lin.ee/x', 'https://example.com/x', 'broken']) {
    assert.equal(isLineConsultationHref(href), false, href);
  }
});
