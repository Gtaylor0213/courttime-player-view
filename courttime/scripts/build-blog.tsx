/**
 * Pre-renders the public blog to static HTML so search engines and link previews
 * see real content (the main app is a client-rendered SPA with an empty index.html).
 *
 * Input:  blog/posts/*.md  (front matter + Markdown; the file name is the URL slug)
 * Output: build/blog/**, build/sitemap.xml, build/robots.txt
 *
 * Runs after `vite build` as part of `npm run build`. Express serves /blog/* from
 * build/blog (see server/index.ts). Set BLOG_DRAFTS=1 to include `draft: true` posts.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'blog', 'posts');
const BUILD_DIR = path.join(ROOT, 'build');
const OUT_DIR = path.join(BUILD_DIR, 'blog');
const SITE_URL = (process.env.SITE_URL || 'https://www.courttimeapp.com').replace(/\/$/, '');
const INCLUDE_DRAFTS = process.env.BLOG_DRAFTS === '1';
const SUPPORT_EMAIL = 'reidbissell@courttimeapp.com';
const DEFAULT_IMAGE = '/og-image.png';

/** Public marketing pages that belong in the sitemap alongside the blog. */
const STATIC_SITEMAP_PATHS = ['/', '/register/facility', '/support', '/privacy', '/terms'];

/** App-only areas crawlers shouldn't waste time on (they redirect to login when logged out). */
const ROBOTS_DISALLOW = [
  '/api/', '/admin', '/developer', '/calendar', '/my-reservations', '/profile', '/quick-reservation',
  '/messages', '/payments', '/lockout-paid', '/bulletin-board', '/hitting-partner', '/shop',
  '/lessons', '/padel', '/ball-machine', '/club/', '/reset-password',
];

interface Post {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated?: string;
  author: string;
  tags: string[];
  image?: string;
  draft: boolean;
  body: string;
  readingMinutes: number;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Minimal front matter: `key: value` lines, `[a, b]` lists, optional quotes. */
function parseFrontMatter(raw: string, file: string): { data: Record<string, string | string[]>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing front matter block (--- ... ---)`);
  const data: Record<string, string | string[]> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) throw new Error(`${file}: can't parse front matter line "${line}"`);
    const value = kv[2].trim();
    data[kv[1]] = value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1).split(',').map(unquote).filter(Boolean)
      : unquote(value);
  }
  return { data, body: match[2] };
}

function unquote(value: string): string {
  const v = value.trim();
  return /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v;
}

function loadPosts(): Post[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const posts = fs.readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const slug = file.replace(/\.md$/, '');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error(`${file}: file names must be lowercase-kebab-case (they become the URL)`);
      }
      const { data, body } = parseFrontMatter(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'), file);
      const str = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : undefined);
      const title = str('title');
      const description = str('description');
      const date = str('date');
      if (!title || !description || !date) throw new Error(`${file}: title, description and date are required`);
      for (const d of [date, str('updated')]) {
        if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`${file}: dates must be YYYY-MM-DD (got "${d}")`);
      }
      if (description.length > 170) {
        console.warn(`[blog] ${file}: description is ${description.length} chars; Google truncates around 155-160`);
      }
      const words = body.split(/\s+/).filter(Boolean).length;
      return {
        slug,
        title,
        description,
        date,
        updated: str('updated'),
        author: str('author') || 'Reid Bissell',
        tags: Array.isArray(data.tags) ? data.tags : [],
        image: str('image'),
        draft: str('draft') === 'true',
        body,
        readingMinutes: Math.max(1, Math.round(words / 230)),
      } satisfies Post;
    })
    .filter((p) => INCLUDE_DRAFTS || !p.draft);
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const postPath = (p: Post) => `/blog/${p.slug}/`;
const absolute = (p: string) => (p.startsWith('http') ? p : `${SITE_URL}${p}`);

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function Layout(props: {
  title: string;
  description: string;
  canonicalPath: string;
  image?: string;
  ogType?: 'website' | 'article';
  jsonLd?: object;
  noindex?: boolean;
  children: React.ReactNode;
}) {
  const image = absolute(props.image || DEFAULT_IMAGE);
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{props.title}</title>
        <meta name="description" content={props.description} />
        {props.noindex ? <meta name="robots" content="noindex" /> : <link rel="canonical" href={absolute(props.canonicalPath)} />}
        <meta property="og:type" content={props.ogType || 'website'} />
        <meta property="og:site_name" content="CourtTime" />
        <meta property="og:title" content={props.title} />
        <meta property="og:description" content={props.description} />
        <meta property="og:url" content={absolute(props.canonicalPath)} />
        <meta property="og:image" content={image} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="theme-color" content="#15803d" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
        <link rel="alternate" type="application/rss+xml" title="CourtTime Blog" href="/blog/feed.xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/blog/blog.css" />
        {props.jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(props.jsonLd).replace(/</g, '\\u003c') }}
          />
        )}
      </head>
      <body>
        <header className="site-header">
          <div className="wrap header-inner">
            <a href="/" className="brand" aria-label="CourtTime home">
              <img src="/blog/logo.png" alt="CourtTime" width="137" height="40" />
            </a>
            <nav className="header-nav" aria-label="Main">
              <a href="/blog/">Blog</a>
              <a href="/login">Sign in</a>
              <a href="/register/facility" className="btn btn-light">Register your facility</a>
            </nav>
          </div>
        </header>
        <main>{props.children}</main>
        <footer className="site-footer">
          <div className="wrap footer-inner">
            <span>&copy; {new Date().getFullYear()} CourtTime</span>
            <nav aria-label="Footer">
              <a href="/">Home</a>
              <a href="/blog/">Blog</a>
              <a href="/blog/feed.xml">RSS</a>
              <a href="/support">Support</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}

function PostMeta({ post }: { post: Post }) {
  return (
    <p className="post-meta">
      <time dateTime={post.date}>{formatDate(post.date)}</time>
      <span aria-hidden="true"> · </span>
      {post.readingMinutes} min read
      {post.draft && <span className="draft-badge">Draft</span>}
    </p>
  );
}

function CallToAction() {
  const demo = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('CourtTime Demo Request')}`;
  return (
    <aside className="cta">
      <h2>Run your courts with CourtTime</h2>
      <p>
        Online booking, fair rules that enforce themselves, and member management in one place.
        $50 per court per year, with a $200 minimum and a $550 maximum.
      </p>
      <div className="cta-actions">
        <a className="btn btn-primary" href="/register/facility">Register your facility</a>
        <a className="btn btn-outline" href={demo}>Request a demo</a>
      </div>
    </aside>
  );
}

function PostPage({ post, related }: { post: Post; related: Post[] }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated || post.date,
    author: { '@type': 'Person', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'CourtTime',
      logo: { '@type': 'ImageObject', url: absolute('/blog/logo.png') },
    },
    image: absolute(post.image || DEFAULT_IMAGE),
    mainEntityOfPage: absolute(postPath(post)),
    keywords: post.tags.join(', '),
  };
  return (
    <Layout
      title={`${post.title} | CourtTime Blog`}
      description={post.description}
      canonicalPath={postPath(post)}
      image={post.image}
      ogType="article"
      jsonLd={jsonLd}
      noindex={post.draft}
    >
      <article className="wrap narrow post">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <a href="/blog/">Blog</a>
        </nav>
        <h1>{post.title}</h1>
        <PostMeta post={post} />
        {post.tags.length > 0 && (
          <ul className="tags" aria-label="Topics">
            {post.tags.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
        <div className="prose">
          <Markdown remarkPlugins={[remarkGfm]}>{post.body}</Markdown>
        </div>
        <CallToAction />
        {related.length > 0 && (
          <section className="related">
            <h2>Keep reading</h2>
            <PostList posts={related} />
          </section>
        )}
      </article>
    </Layout>
  );
}

function PostList({ posts }: { posts: Post[] }) {
  return (
    <ul className="post-list">
      {posts.map((p) => (
        <li key={p.slug} className="post-card">
          <h3><a href={postPath(p)}>{p.title}</a></h3>
          <PostMeta post={p} />
          <p>{p.description}</p>
        </li>
      ))}
    </ul>
  );
}

function IndexPage({ posts }: { posts: Post[] }) {
  return (
    <Layout
      title="CourtTime Blog | Running Better Courts for Clubs and HOAs"
      description="Practical guides for club managers, HOA boards, and pros on court booking rules, member management, and running a busier, fairer facility."
      canonicalPath="/blog/"
    >
      <section className="hero">
        <div className="wrap narrow">
          <h1>The CourtTime Blog</h1>
          <p>Practical advice for running courts that members love, from fair booking rules to cutting front-desk busywork.</p>
        </div>
      </section>
      <div className="wrap narrow">
        {posts.length ? <PostList posts={posts} /> : <p className="empty">New posts are on the way.</p>}
      </div>
    </Layout>
  );
}

function NotFoundPage() {
  return (
    <Layout title="Page not found | CourtTime Blog" description="That blog post doesn't exist." canonicalPath="/blog/" noindex>
      <div className="wrap narrow post">
        <h1>We couldn't find that post</h1>
        <p><a href="/blog/">Browse all posts</a></p>
      </div>
    </Layout>
  );
}

/** Up to two other posts, preferring shared tags, then recency. */
function relatedPosts(post: Post, all: Post[]): Post[] {
  return all
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({ p, score: p.tags.filter((t) => post.tags.includes(t)).length }))
    .sort((a, b) => b.score - a.score || b.p.date.localeCompare(a.p.date))
    .slice(0, 2)
    .map(({ p }) => p);
}

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rssFeed(posts: Post[]): string {
  const items = posts.map((p) => `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${absolute(postPath(p))}</link>
      <guid>${absolute(postPath(p))}</guid>
      <pubDate>${new Date(`${p.date}T12:00:00Z`).toUTCString()}</pubDate>
      <description>${xmlEscape(p.description)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CourtTime Blog</title>
    <link>${absolute('/blog/')}</link>
    <description>Practical advice for running courts that members love.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`;
}

function sitemap(posts: Post[]): string {
  const entries = [
    ...STATIC_SITEMAP_PATHS.map((p) => ({ loc: absolute(p), lastmod: undefined as string | undefined })),
    { loc: absolute('/blog/'), lastmod: posts[0]?.updated || posts[0]?.date },
    ...posts.map((p) => ({ loc: absolute(postPath(p)), lastmod: p.updated || p.date })),
  ];
  const urls = entries
    .map((e) => `  <url><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function robots(): string {
  return ['User-agent: *', ...ROBOTS_DISALLOW.map((p) => `Disallow: ${p}`), '', `Sitemap: ${absolute('/sitemap.xml')}`, ''].join('\n');
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function writeHtml(relPath: string, element: React.ReactElement) {
  const file = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `<!DOCTYPE html>${renderToStaticMarkup(element)}`);
}

function build() {
  const posts = loadPosts();
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  fs.copyFileSync(path.join(ROOT, 'blog', 'blog.css'), path.join(OUT_DIR, 'blog.css'));
  fs.copyFileSync(path.join(ROOT, 'src', 'assets', 'courttime-logo.png'), path.join(OUT_DIR, 'logo.png'));
  const imagesDir = path.join(ROOT, 'blog', 'images');
  if (fs.existsSync(imagesDir)) fs.cpSync(imagesDir, path.join(OUT_DIR, 'images'), { recursive: true });

  writeHtml('index.html', <IndexPage posts={posts} />);
  writeHtml('404.html', <NotFoundPage />);
  for (const post of posts) {
    writeHtml(path.join(post.slug, 'index.html'), <PostPage post={post} related={relatedPosts(post, posts)} />);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'feed.xml'), rssFeed(posts.filter((p) => !p.draft)));
  fs.writeFileSync(path.join(BUILD_DIR, 'sitemap.xml'), sitemap(posts.filter((p) => !p.draft)));
  fs.writeFileSync(path.join(BUILD_DIR, 'robots.txt'), robots());

  const drafts = posts.filter((p) => p.draft).length;
  console.log(`[blog] built ${posts.length} post(s)${drafts ? ` incl. ${drafts} draft(s)` : ''} → ${path.relative(ROOT, OUT_DIR)}`);
}

build();
