// RatingGap static site generator.
// No framework, no runtime deps — every page ships as plain HTML so Google can
// index it on first crawl (养网站防老 第3/5步: 静态页面 + 内链 + 结构化数据).

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'dist')

// Project pages live under /ratinggap/. Set BASE_PATH='' when a custom domain is attached.
const BASE = process.env.BASE_PATH ?? '/ratinggap'
const ORIGIN = process.env.SITE_ORIGIN ?? 'https://phbst.github.io'
const SITE = ORIGIN + BASE
const GA_ID = process.env.GA_ID ?? ''

const data = JSON.parse(readFileSync(join(ROOT, 'data', 'apps.json'), 'utf8'))
const APPS = data.apps
const THEMES = data.themes

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const pct = n => Math.round(n * 100)
const num = n => (n ?? 0).toLocaleString('en-US')
const url = p => `${BASE}${p}`

const themeBy = Object.fromEntries(THEMES.map(t => [t.key, t]))
const genres = [...new Set(APPS.map(a => a.genre))].sort()
const genreSlug = g => g.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Revenue tier from grossing rank — honest about being a proxy, unlike a fabricated $/mo figure.
function tier (app) {
  const r = app.charts[0].rank
  if (app.charts[0].chart === 'Overall') return r <= 25 ? 'Top 25 grossing overall' : 'Top 100 grossing overall'
  if (r <= 10) return 'Top 10 in category'
  if (r <= 50) return 'Top 50 in category'
  return 'Top 100 in category'
}

function layout ({ title, description, canonical, body, jsonld = [], breadcrumb }) {
  const crumbs = breadcrumb ? `<nav class="crumbs" aria-label="Breadcrumb">${breadcrumb
    .map((c, i) => i === breadcrumb.length - 1
      ? `<span aria-current="page">${esc(c.name)}</span>`
      : `<a href="${c.href}">${esc(c.name)}</a>`).join('<span class="sep">/</span>')}</nav>` : ''

  const ld = jsonld.length
    ? jsonld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('')
    : ''

  // 哥飞 第8步: analytics goes last, inside a hidden div, so a slow tracker never blocks paint.
  const ga = GA_ID ? `<div style="display:none">
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}')</script>
</div>` : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="26" font-size="26">📉</text></svg>')}">
<link rel="stylesheet" href="${url('/style.css')}">
${ld}
</head>
<body>
<header class="site">
  <a class="brand" href="${url('/')}"><span class="mark">📉</span> RatingGap</a>
  <nav>
    <a href="${url('/')}">Finder</a>
    <a href="${url('/method/')}">Method</a>
    <a href="${url('/complaints/')}">Complaints</a>
  </nav>
</header>
<main>
${crumbs}
${body}
</main>
<footer class="site">
  <p><strong>RatingGap</strong> — proven revenue, broken execution. Free forever, no signup.</p>
  <p class="fine">Data from Apple's public RSS marketing feeds and the iTunes Lookup API, refreshed on build.
  Revenue is expressed as US top-grossing chart rank, a public proxy — we do not estimate dollar figures.
  Ratings and review counts are Apple's. Review excerpts are short quotations shown for research and link back to the App Store.
  Not affiliated with or endorsed by Apple Inc. Snapshot: ${data.generatedAt.slice(0, 10)}.</p>
  <p class="fine"><a href="${url('/')}">Finder</a> · <a href="${url('/method/')}">Method</a> · <a href="${url('/complaints/')}">Complaint index</a> · <a href="https://github.com/phbst/ratinggap">Source</a></p>
</footer>
${ga}
</body>
</html>`
}

function write (path, html) {
  const dir = join(OUT, path)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html)
}

// ------------------------------------------------------------------- home
function homePage () {
  const rows = APPS.slice(0, 300)
  const body = `
<section class="hero">
  <h1>Find app ideas that already work</h1>
  <p class="lede">Every app here is on a US top-grossing chart — the demand and the willingness to pay
  are already proven. Every app here is also <strong>badly rated</strong>. RatingGap reads the
  one-star reviews and tells you exactly what people hate, so you know what a better version has to fix.</p>
  <ul class="steps">
    <li><span>1</span> Proven revenue<br><small>US top-grossing charts, ${data.filters.chartLimit} deep, all categories</small></li>
    <li><span>2</span> Sorted worst-first<br><small>${APPS.length} apps rated ≤ ${data.filters.maxRating}★ with ${num(data.filters.minReviews)}+ reviews</small></li>
    <li><span>3</span> Complaints mined<br><small>Recent reviews clustered into fixable themes</small></li>
    <li><span>4</span> Build the fix<br><small>Each teardown ends in a concrete spec</small></li>
  </ul>
</section>

<section class="controls" aria-label="Filters">
  <label>Category
    <select id="f-genre"><option value="">All categories</option>${genres.map(g => `<option>${esc(g)}</option>`).join('')}</select>
  </label>
  <label>Top complaint
    <select id="f-theme"><option value="">Any complaint</option>${THEMES.map(t => `<option value="${t.key}">${esc(t.label)}</option>`).join('')}</select>
  </label>
  <label>Max rating
    <select id="f-rating"><option value="4.6">≤ 4.6★</option><option value="4.2">≤ 4.2★</option><option value="4.0">≤ 4.0★</option><option value="3.7">≤ 3.7★</option></select>
  </label>
  <label>Sort
    <select id="f-sort">
      <option value="score">Opportunity score</option>
      <option value="rating">Worst rated first</option>
      <option value="reviews">Most reviews</option>
      <option value="rank">Highest grossing</option>
    </select>
  </label>
  <label class="search">Search
    <input id="f-q" type="search" placeholder="app or company name" autocomplete="off">
  </label>
</section>

<p class="count" id="count">${rows.length} apps</p>

<div class="cards" id="results">
${rows.map(cardHTML).join('\n')}
</div>
<p class="more" id="more"></p>

<script>window.__APPS__=${JSON.stringify(APPS.map(a => ({
    s: a.slug, n: a.name, se: a.seller, g: a.genre, r: a.rating, rv: a.reviews,
    c: a.charts[0].chart, k: a.charts[0].rank, sc: a.score, ic: a.icon,
    t: a.analysis.themes[0]?.key, tl: a.analysis.themes[0]?.label, tp: pct(a.analysis.themes[0]?.share ?? 0),
  })))}</script>
<script src="${url('/app.js')}" defer></script>
`
  return layout({
    title: 'RatingGap — find app ideas that already work (free App Store research)',
    description: `${APPS.length} apps that are on US top-grossing charts but rated ${data.filters.maxRating}★ or worse. See what their users actually complain about, and what a better version has to fix. Free, no signup.`,
    canonical: SITE + '/',
    breadcrumb: null,
    body,
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'WebSite', name: 'RatingGap', url: SITE + '/',
      description: 'Find app ideas that already work: top-grossing apps with the worst ratings, and the complaints a better version must fix.',
    }, {
      '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: rows.slice(0, 50).map((a, i) => ({
        '@type': 'ListItem', position: i + 1, name: a.name, url: `${SITE}/app/${a.slug}/`,
      })),
    }],
  })
}

function cardHTML (a) {
  const t = a.analysis.themes[0]
  return `<article class="card">
  <a class="card-main" href="${url(`/app/${a.slug}/`)}">
    <img src="${esc(a.icon)}" alt="" width="56" height="56" loading="lazy">
    <div class="card-id">
      <h2>${esc(a.name)}</h2>
      <p class="seller">${esc(a.seller)} · ${esc(a.genre)}</p>
    </div>
    <div class="score" title="Opportunity score">${a.score}</div>
  </a>
  <dl class="stats">
    <div><dt>Rating</dt><dd class="bad">${a.rating.toFixed(2)}★</dd></div>
    <div><dt>Reviews</dt><dd>${num(a.reviews)}</dd></div>
    <div><dt>Revenue</dt><dd>${esc(tier(a))}</dd></div>
  </dl>
  ${t ? `<p class="top-theme"><a href="${url(`/complaint/${t.key}/`)}">${esc(t.label)}</a> in ${pct(t.share)}% of negative reviews</p>` : ''}
</article>`
}

// --------------------------------------------------------------- app pages
function appPage (a) {
  const themes = a.analysis.themes
  const top = themes[0]
  const spec = themes.slice(0, 4)

  const body = `
<article class="teardown">
  <header class="app-head">
    <img src="${esc(a.icon)}" alt="${esc(a.name)} icon" width="88" height="88">
    <div>
      <h1>${esc(a.name)}: what users hate, and what to build instead</h1>
      <p class="lede">${esc(a.seller)} · ${esc(a.genre)} · ${esc(a.price)} · updated ${esc(a.updated)}</p>
    </div>
    <div class="score big" title="Opportunity score">${a.score}<small>opportunity</small></div>
  </header>

  <section class="numbers">
    <h2>The gap</h2>
    <p>${esc(a.name)} sits at <strong>${esc(tier(a))}</strong> in the US App Store, so people are paying for it.
    It is rated <strong>${a.rating.toFixed(2)}★ across ${num(a.reviews)} reviews</strong>${a.ratingCurrent && Math.abs(a.ratingCurrent - a.rating) > 0.15
      ? `, and the current version is running at <strong>${a.ratingCurrent.toFixed(2)}★</strong>` : ''}.
    That distance between revenue and satisfaction is the opening.</p>
    <dl class="stats wide">
      <div><dt>Rating</dt><dd class="bad">${a.rating.toFixed(2)}★</dd></div>
      <div><dt>Reviews</dt><dd>${num(a.reviews)}</dd></div>
      <div><dt>Best chart rank</dt><dd>${esc(a.charts[0].chart)} #${a.charts[0].rank}</dd></div>
      <div><dt>Negative in sample</dt><dd>${pct(a.analysis.negativeShare)}% of ${num(a.analysis.sampled)}</dd></div>
      <div><dt>Released</dt><dd>${esc(a.released)}</dd></div>
      <div><dt>Price</dt><dd>${esc(a.price)}</dd></div>
    </dl>
    <p class="charts-line">On ${a.charts.length} grossing chart${a.charts.length > 1 ? 's' : ''}:
    ${a.charts.slice(0, 6).map(c => `<code>${esc(c.chart)} #${c.rank}</code>`).join(' ')}</p>
    <p class="fine">The sample is the ${num(a.analysis.sampled)} <em>most recent</em> reviews, not a random draw.
    People who leave a recent review skew unhappy, so ${pct(a.analysis.negativeShare)}% negative is a reading of
    current sentiment — it is not the lifetime distribution behind the ${a.rating.toFixed(2)}★ average.
    What matters below is the <em>mix</em> of complaints, which the skew does not distort.</p>
  </section>

  <section>
    <h2>What the ${num(a.analysis.negativeShare ? a.analysis.negativeCount : 0)} recent negative reviews are about</h2>
    <p class="sub">Share of ≤3★ reviews in our sample that mention each theme. Reviews often hit more than one.</p>
    <div class="bars">
      ${themes.map(t => `<div class="bar-row">
        <a class="bar-label" href="${url(`/complaint/${t.key}/`)}">${esc(t.label)}</a>
        <div class="bar"><span style="width:${Math.max(3, pct(t.share))}%"></span></div>
        <span class="bar-num">${pct(t.share)}%</span>
      </div>`).join('')}
    </div>
  </section>

  ${top && top.evidence.length ? `<section>
    <h2>In their words</h2>
    <p class="sub">Short excerpts from recent App Store reviews, strongest theme first.</p>
    ${spec.filter(t => t.evidence.length).map(t => `<div class="quotes">
      <h3>${esc(t.label)}</h3>
      ${t.evidence.map(e => `<blockquote><span class="stars">${'★'.repeat(e.stars)}${'☆'.repeat(5 - e.stars)}</span> ${esc(e.snippet)}</blockquote>`).join('')}
    </div>`).join('')}
    <p class="fine">Excerpts are quoted for research. Read them in full on <a href="${esc(a.url)}" rel="nofollow noopener">the App Store listing</a>.</p>
  </section>` : ''}

  <section class="spec">
    <h2>What a better version has to fix</h2>
    <p>Ranked by how much of the complaint volume each one removes.</p>
    <ol>
      ${spec.map(t => `<li><strong>${esc(t.label)}</strong> — hit in ${pct(t.share)}% of negative reviews.<br>${esc(t.fix)}</li>`).join('')}
    </ol>
    <p class="callout">Demand is already proven by the chart position. You are not testing whether people
    want this — you are testing whether they will switch. Fix the top two and the switch pitch writes itself.</p>
  </section>

  <section class="next">
    <h2>Keep looking</h2>
    <p>More badly-rated earners in <a href="${url(`/category/${genreSlug(a.genre)}/`)}">${esc(a.genre)}</a>,
    more apps whose users are angry about <a href="${url(`/complaint/${top.key}/`)}">${esc(top.label.toLowerCase())}</a>,
    or go back to the <a href="${url('/')}">full finder</a>.</p>
    <p><a class="btn" href="${esc(a.url)}" rel="nofollow noopener">View ${esc(a.name)} on the App Store →</a></p>
  </section>
</article>`

  return layout({
    title: `${a.name} — ${a.rating.toFixed(2)}★ but top-grossing: the complaint teardown | RatingGap`,
    description: `${a.name} is ${tier(a).toLowerCase()} yet rated ${a.rating.toFixed(2)}★ across ${num(a.reviews)} reviews. ${top ? `${pct(top.share)}% of negative reviews are about ${top.label.toLowerCase()}.` : ''} See the full complaint breakdown and what a better version must fix.`,
    canonical: `${SITE}/app/${a.slug}/`,
    breadcrumb: [
      { name: 'Finder', href: url('/') },
      { name: a.genre, href: url(`/category/${genreSlug(a.genre)}/`) },
      { name: a.name },
    ],
    body,
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'Article',
      headline: `${a.name}: what users hate, and what to build instead`,
      about: { '@type': 'SoftwareApplication', name: a.name, applicationCategory: a.genre,
        aggregateRating: { '@type': 'AggregateRating', ratingValue: a.rating, reviewCount: a.reviews, bestRating: 5 } },
      isPartOf: { '@type': 'WebSite', name: 'RatingGap', url: SITE + '/' },
    }, {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Finder', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: a.genre, item: `${SITE}/category/${genreSlug(a.genre)}/` },
        { '@type': 'ListItem', position: 3, name: a.name },
      ],
    }],
  })
}

// ---------------------------------------------------------- hub pages
function listSection (apps) {
  return `<div class="cards">${apps.map(cardHTML).join('\n')}</div>`
}

function categoryPage (genre) {
  const apps = APPS.filter(a => a.genre === genre).sort((a, b) => b.score - a.score)
  const worst = apps[0]
  const tally = {}
  for (const a of apps) for (const t of a.analysis.themes) tally[t.key] = (tally[t.key] || 0) + 1
  const ranked = Object.entries(tally).sort((x, y) => y[1] - x[1]).slice(0, 5)

  const body = `
<h1>Badly rated ${esc(genre)} apps that still make money</h1>
<p class="lede">${apps.length} ${esc(genre)} app${apps.length > 1 ? 's' : ''} on US top-grossing charts rated
${data.filters.maxRating}★ or worse. ${worst ? `The widest gap right now is <a href="${url(`/app/${worst.slug}/`)}">${esc(worst.name)}</a> at ${worst.rating.toFixed(2)}★.` : ''}</p>

<section>
  <h2>What ${esc(genre)} users complain about most</h2>
  <ul class="theme-list">
    ${ranked.map(([k, n]) => `<li><a href="${url(`/complaint/${k}/`)}">${esc(themeBy[k].label)}</a> — a top theme in ${n} of these apps</li>`).join('')}
  </ul>
</section>

<h2>Every ${esc(genre)} app with a rating gap</h2>
${listSection(apps)}

<section class="next">
  <h2>Other categories</h2>
  <p class="tags">${genres.filter(g => g !== genre).map(g => `<a href="${url(`/category/${genreSlug(g)}/`)}">${esc(g)}</a>`).join('')}</p>
</section>`

  return layout({
    title: `Badly rated ${genre} apps that still make money | RatingGap`,
    description: `${apps.length} top-grossing ${genre} apps rated ${data.filters.maxRating}★ or worse, with the complaint breakdown behind each low rating. Free App Store research, no signup.`,
    canonical: `${SITE}/category/${genreSlug(genre)}/`,
    breadcrumb: [{ name: 'Finder', href: url('/') }, { name: genre }],
    body,
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: `Badly rated ${genre} apps that still make money`,
      itemListElement: apps.slice(0, 50).map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.name, url: `${SITE}/app/${a.slug}/` })),
    }],
  })
}

function complaintPage (theme) {
  const apps = APPS
    .filter(a => a.analysis.themes.some(t => t.key === theme.key))
    .map(a => ({ a, share: a.analysis.themes.find(t => t.key === theme.key).share }))
    .sort((x, y) => y.share - x.share)
    .map(x => x.a)
  if (!apps.length) return null

  const body = `
<h1>Top-grossing apps whose users complain about ${esc(theme.label.toLowerCase())}</h1>
<p class="lede">${apps.length} apps that clear a US top-grossing chart while their reviewers keep raising the same
problem: <strong>${esc(theme.label.toLowerCase())}</strong>. Proven demand, one repeated, fixable failure.</p>

<section class="callout-box">
  <h2>What to do about it</h2>
  <p>${esc(theme.fix)}</p>
</section>

<h2>The apps</h2>
${listSection(apps)}

<section class="next">
  <h2>Other complaint patterns</h2>
  <p class="tags">${THEMES.filter(t => t.key !== theme.key).map(t => `<a href="${url(`/complaint/${t.key}/`)}">${esc(t.label)}</a>`).join('')}</p>
</section>`

  return layout({
    title: `Top-grossing apps with ${theme.label.toLowerCase()} complaints | RatingGap`,
    description: `${apps.length} apps on US top-grossing charts whose negative reviews keep hitting ${theme.label.toLowerCase()}. See how concentrated the complaint is for each one, and what to build instead.`,
    canonical: `${SITE}/complaint/${theme.key}/`,
    breadcrumb: [{ name: 'Finder', href: url('/') }, { name: 'Complaints', href: url('/complaints/') }, { name: theme.label }],
    body,
  })
}

function complaintIndexPage () {
  const counts = Object.fromEntries(THEMES.map(t => [t.key, 0]))
  for (const a of APPS) for (const t of a.analysis.themes) counts[t.key]++
  const live = THEMES.filter(t => counts[t.key] > 0).sort((a, b) => counts[b.key] - counts[a.key])

  const body = `
<h1>Why users abandon apps that make money</h1>
<p class="lede">Every negative review in our sample is matched against these ${live.length} patterns.
Pick the failure you know how to fix, and see who is currently getting paid despite it.</p>
<div class="theme-cards">
  ${live.map(t => `<a class="theme-card" href="${url(`/complaint/${t.key}/`)}">
    <h2>${esc(t.label)}</h2>
    <p class="n">${counts[t.key]} apps</p>
    <p>${esc(t.fix)}</p>
  </a>`).join('')}
</div>
<section class="next"><h2>Browse by category instead</h2>
<p class="tags">${genres.map(g => `<a href="${url(`/category/${genreSlug(g)}/`)}">${esc(g)}</a>`).join('')}</p></section>`

  return layout({
    title: 'Why users abandon apps that make money — complaint index | RatingGap',
    description: 'The recurring reasons people one-star a top-grossing app: paywalls, free-tier limits, ads, cancellation traps, bugs, forced accounts. Browse proven earners by the complaint you can fix.',
    canonical: `${SITE}/complaints/`,
    breadcrumb: [{ name: 'Finder', href: url('/') }, { name: 'Complaints' }],
    body,
  })
}

function methodPage () {
  const body = `
<h1>How to find app ideas that already work</h1>
<p class="lede">The method is not ours. It is a five-step routine that circulates among indie developers:
find demand first, then build. RatingGap runs steps one to four for you, every build, on public Apple data.</p>

<section>
  <h2>The five steps</h2>
  <ol class="method">
    <li><strong>Start from money, not ideas.</strong> An app that ranks on a US top-grossing chart has already
    proven that this problem is worth paying for. You skip the entire question of whether demand exists.</li>
    <li><strong>Filter to real revenue.</strong> We take the top ${data.filters.chartLimit} grossing apps in every
    category. Chart position is a public proxy — we show you the rank rather than inventing a dollar figure.</li>
    <li><strong>Sort by rating, ascending.</strong> A high-grossing app with a bad rating is a market where
    customers pay because they have no better option. That is the opening.</li>
    <li><strong>Read the one-star reviews.</strong> This is the step people skip, and it is the only one that
    tells you <em>what</em> to build. We sample recent reviews for every candidate and cluster the complaints
    into ${THEMES.length} recurring, fixable patterns.</li>
    <li><strong>Build the better version.</strong> Not a better app in general — a fix for the specific thing
    that is generating one-star reviews today.</li>
  </ol>
</section>

<section>
  <h2>How the opportunity score works</h2>
  <p>Every app gets one number so the list can be ranked. It is deliberately simple, and every input is
  printed on the app's own page so you can disagree with it:</p>
  <pre><code>score = chart strength
      × share of sampled reviews that are negative
      × (5 − rating)
      × how concentrated the top complaint is</code></pre>
  <p>A high score means: this app makes real money, a lot of its recent reviewers are unhappy, the rating is
  genuinely bad, and the unhappiness has <em>one</em> dominant cause rather than being diffuse. Diffuse
  unhappiness is hard to beat. One dominant, fixable cause is a product plan.</p>
</section>

<section>
  <h2>What this does not tell you</h2>
  <ul>
    <li><strong>Not revenue.</strong> Chart rank is a proxy. We refuse to print invented dollar amounts.</li>
    <li><strong>Not a moat.</strong> Some apps are badly rated because the underlying job is genuinely hard,
    or because they depend on hardware, a licence or a data feed you cannot get. Read the complaints before
    you assume the incumbent is merely lazy.</li>
    <li><strong>Not distribution.</strong> Proven demand tells you people will pay. It does not tell you how
    they will find you. That problem is still yours.</li>
    <li><strong>A sample, not a census.</strong> We read recent reviews, not all of them, and only the US store.</li>
  </ul>
</section>

<section class="next">
  <h2>Start looking</h2>
  <p><a class="btn" href="${url('/')}">Open the finder →</a></p>
  <p>Or browse by <a href="${url('/complaints/')}">the complaint you want to fix</a>.</p>
</section>`

  return layout({
    title: 'How to find app ideas that already work — the method | RatingGap',
    description: 'Find demand, then build: filter to top-grossing apps, sort by rating ascending, read the one-star reviews, fix the specific complaint. The full method, and how the opportunity score is computed.',
    canonical: `${SITE}/method/`,
    breadcrumb: [{ name: 'Finder', href: url('/') }, { name: 'Method' }],
    body,
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'HowTo',
      name: 'How to find app ideas that already work',
      step: [
        { '@type': 'HowToStep', name: 'Start from money, not ideas' },
        { '@type': 'HowToStep', name: 'Filter to apps with proven revenue' },
        { '@type': 'HowToStep', name: 'Sort by rating, ascending' },
        { '@type': 'HowToStep', name: 'Read the one-star reviews' },
        { '@type': 'HowToStep', name: 'Build the better version' },
      ],
    }],
  })
}

// ------------------------------------------------------------------ emit
mkdirSync(OUT, { recursive: true })

write('', homePage())
write('method', methodPage())
write('complaints', complaintIndexPage())

for (const a of APPS) write(`app/${a.slug}`, appPage(a))
for (const g of genres) write(`category/${genreSlug(g)}`, categoryPage(g))
let complaintPages = 0
for (const t of THEMES) {
  const html = complaintPage(t)
  if (html) { write(`complaint/${t.key}`, html); complaintPages++ }
}

// sitemap + robots (哥飞 第8步)
const urls = [
  { loc: `${SITE}/`, pri: '1.0', freq: 'daily' },
  { loc: `${SITE}/method/`, pri: '0.8', freq: 'monthly' },
  { loc: `${SITE}/complaints/`, pri: '0.8', freq: 'weekly' },
  ...genres.map(g => ({ loc: `${SITE}/category/${genreSlug(g)}/`, pri: '0.7', freq: 'weekly' })),
  ...THEMES.filter(t => APPS.some(a => a.analysis.themes.some(x => x.key === t.key)))
    .map(t => ({ loc: `${SITE}/complaint/${t.key}/`, pri: '0.7', freq: 'weekly' })),
  ...APPS.map(a => ({ loc: `${SITE}/app/${a.slug}/`, pri: '0.6', freq: 'weekly' })),
]
const today = data.generatedAt.slice(0, 10)
writeFileSync(join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `<url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n') +
  `\n</urlset>\n`)
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)
writeFileSync(join(OUT, '.nojekyll'), '')

for (const f of ['style.css', 'app.js']) cpSync(join(ROOT, 'src', f), join(OUT, f))
if (existsSync(join(ROOT, 'src', 'CNAME'))) cpSync(join(ROOT, 'src', 'CNAME'), join(OUT, 'CNAME'))

console.log(`built ${urls.length} pages -> dist/`)
console.log(`  1 home, 1 method, 1 complaint index`)
console.log(`  ${APPS.length} app teardowns, ${genres.length} categories, ${complaintPages} complaint hubs`)
console.log(`  base=${BASE || '(root)'}  origin=${ORIGIN}  ga=${GA_ID || 'not set'}`)
