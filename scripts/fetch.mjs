// RatingGap data pipeline
// Automates the 5-step SOP: top-grossing charts (revenue proxy) -> ratings -> sort worst-first
// -> mine what users actually complain about (the bridge to "build a better version").
// Sources: Apple public RSS marketing feeds + iTunes Lookup API. No API key, no scraping.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; RatingGap/1.0; +https://github.com/phbst/ratinggap)' }

const COUNTRY = 'us'
const CHART_LIMIT = 100      // Apple caps the legacy grossing feed at 100 regardless of what we ask for
const MIN_REVIEWS = 1000     // ignore apps with too little signal
const MAX_RATING = 4.5       // "pick the worst rated ones"
const REVIEW_PAGES = 3       // ~150 recent reviews per candidate

// Apple throttles the customerreviews feed hard (200 once, then 403 for a while).
// We crawl it slowly, back off when told to, and cache to disk so successive runs
// accumulate coverage instead of restarting from zero.
const REVIEW_CONCURRENCY = 2
const REVIEW_SPACING_MS = 350
const CACHE_TTL_DAYS = 7
const CACHE_PATH = join(ROOT, 'data', 'reviews-cache.json')

// Genre ids Apple exposes on the grossing feed. Games excluded: not a web-buildable niche.
const GENRES = {
  'Overall': '', 'Business': '6000', 'Weather': '6001', 'Utilities': '6002', 'Travel': '6003',
  'Sports': '6004', 'Social Networking': '6005', 'Reference': '6006', 'Productivity': '6007',
  'Photo & Video': '6008', 'News': '6009', 'Navigation': '6010', 'Music': '6011',
  'Lifestyle': '6012', 'Health & Fitness': '6013', 'Finance': '6015', 'Entertainment': '6016',
  'Education': '6017', 'Books': '6018', 'Medical': '6020', 'Food & Drink': '6023',
  'Shopping': '6024', 'Developer Tools': '6026', 'Graphics & Design': '6027',
}

// Complaint taxonomy. Each theme carries the "so what" — the thing a better version must fix.
const THEMES = [
  { key: 'paywall',      label: 'Paywall & forced upgrade', fix: 'Ship a free tier that is actually usable. No hard caps on the core action.',
    re: /paywall|pay ?wall|forced? to pay|have to pay|must pay|behind a paywall|not really free|isn.?t free|used to be free|charge(s|d)? (me|for)|greedy|rip.?off|money grab|expensive|overpriced|too pricey|price (increase|hike|went up)/i },
  // Deliberately narrow: a "50 mile limit" or "limited selection" is not a free-tier cap.
  { key: 'limits',       label: 'Free-tier limits', fix: 'Remove daily/entry caps. Cap on advanced features instead of on basic use.',
    re: /free (version|tier|plan|users?) (is |are |only |can )?(so )?limit|(daily|weekly|monthly|per.?day) (limit|cap|allowance)|limit(ed)? (to|of) \d+ ?\w* (per|a|each) (day|week|month)|(can |will )?only (add|log|enter|create|save|scan|use|do|make) \d+|\d+ (entries|expenses|items|scans|uses|searches|questions|messages) (per|a) day|cap(ped)? at \d+|limited (features|functionality|access|version)|only \d+ (free|per day|a day)|unless you (pay|upgrade|subscribe)/i },
  { key: 'ads',          label: 'Ads & interruptions', fix: 'No forced ad-watching before the core action. Ads never gate functionality.',
    re: /\bads?\b|advertis|commercial|pop.?up|popup|watch a (video|\d+)|interrupt|banner/i },
  { key: 'subscription', label: 'Subscription & cancellation', fix: 'One-click cancel, clear renewal dates, no dark patterns, no surprise charges.',
    re: /subscription|auto.?renew|free trial|trial (period|ended|expired)|(can.?t|cannot|couldn.?t|unable to|impossible to|no way to|hard to) (cancel|unsubscribe|get a refund)|charged? (me|my|again|twice|anyway|without|after)|hidden (charge|fee|cost)|surprise (charge|bill)|refund|billing|unsubscribe/i },
  { key: 'bugs',         label: 'Bugs & crashes', fix: 'Reliability first. Deterministic behaviour, no data corruption, no silent failures.',
    re: /crash(es|ed|ing)?|bug(s|gy)?|glitch(y|es)?|freeze(s|ing)?|frozen|broken|doesn.?t work|does not work|won.?t (open|load|work)|error|stuck|lag(gy|s|ging)?|slow/i },
  { key: 'dataloss',     label: 'Data loss & sync', fix: 'Local-first storage, export on demand, no lock-in, sync that cannot lose data.',
    re: /lost (my|all|the) (data|entries|info)|data loss|deleted (my|all|everything)|didn.?t save|not sav(e|ed|ing)|sync(ing|ed)? (issue|problem|fail)|doesn.?t sync|won.?t sync|disappear(ed|s)?/i },
  { key: 'ux',           label: 'Confusing UX', fix: 'One obvious path through the core job. No hidden state, no surprise behaviour.',
    re: /confus(ing|ed|es)|not intuitive|unintuitive|hard to (use|figure|navigate)|difficult to use|complicated|clunky|cluttered|overwhelming|can.?t figure out|user.?unfriendly|terrible (ui|ux|design)/i },
  { key: 'support',      label: 'Support & trust', fix: 'Human support with a real reply window. Publish it and hit it.',
    re: /(customer )?(support|service) (is|was)? ?(terrible|awful|non.?existent|horrible|bad|poor)|no (response|reply)|never (responded|replied|got back)|contacted support|ignored|no help/i },
  { key: 'signup',       label: 'Forced account', fix: 'Let people finish the core job before asking for an account. Ideally never ask.',
    re: /(forced?|have|make(s)?) (you |me |us )?to (sign|creat|regist|log)|sign.?up (required|to)|create an account|requires? (an )?account|must (register|sign up)|login required/i },
  { key: 'accuracy',     label: 'Wrong results', fix: 'Show the working. Let users correct inputs and see how the number changes.',
    re: /(in)?accurate|incorrect|miscalculat|doesn.?t (add up|match)|numbers (are|were) (off|wrong)|wrong (answer|result|number|amount|info|data|address|location|translation|price|total)|calculat\w* (is|are|was) wrong|not (accurate|correct)/i },
  { key: 'privacy',      label: 'Privacy & permissions', fix: 'Process on-device where possible. Ask for the minimum, explain each ask.',
    re: /privacy|personal (data|info)|sell(s|ing)? (my|your) data|permission|track(s|ing) me|spy|creepy/i },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function getJSON (url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return await res.json()
    } catch {
      await sleep(400 * (i + 1))
    }
  }
  return null
}

// Shared cooldown: when Apple starts 403-ing, every worker slows down together
// rather than each one burning its own retries against a closed door.
let cooldownUntil = 0
let throttleHits = 0

async function getReviewJSON (url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = cooldownUntil - Date.now()
    if (wait > 0) await sleep(wait)
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) })
      if (res.status === 403 || res.status === 429) {
        throttleHits++
        const backoff = Math.min(20000, 1200 * 2 ** attempt)
        cooldownUntil = Math.max(cooldownUntil, Date.now() + backoff)
        continue
      }
      if (!res.ok) return null
      return await res.json()
    } catch {
      await sleep(600 * (attempt + 1))
    }
  }
  return null
}

// Run async jobs with bounded concurrency.
async function pool (items, limit, worker) {
  const out = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await worker(items[i], i)
    }
  }))
  return out
}

// Apple's JSON feeds collapse a single-element `entry` list into a bare object.
const asArray = v => (v == null ? [] : Array.isArray(v) ? v : [v])

const slugify = s => (s || '').toLowerCase()
  .replace(/[''’`]/g, '').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 60) || 'app'

// ---------------------------------------------------------------- step 1 + 2
// Grossing rank is our revenue proxy. Being on a US grossing chart at all means
// the app clears the tweet's ">$50k/mo" bar by a wide margin; we keep the rank so
// we can show a defensible tier instead of inventing a dollar figure.
async function fetchCharts () {
  const entries = Object.entries(GENRES)
  const ids = new Map()
  await pool(entries, 8, async ([name, gid]) => {
    const url = `https://itunes.apple.com/${COUNTRY}/rss/topgrossingapplications/limit=${CHART_LIMIT}/${gid ? `genre=${gid}/` : ''}json`
    const data = await getJSON(url)
    const list = asArray(data?.feed?.entry)
    if (!list.length) { console.warn('  ! chart failed:', name); return }
    list.forEach((e, i) => {
      const id = e.id?.attributes?.['im:id']
      if (!id) return
      if (!ids.has(id)) ids.set(id, [])
      ids.get(id).push({ chart: name, rank: i + 1 })
    })
    console.log(`  chart ${name.padEnd(18)} ${list.length}`)
  })
  return ids
}

async function fetchMetadata (ids) {
  const all = [...ids.keys()]
  const batches = []
  for (let i = 0; i < all.length; i += 60) batches.push(all.slice(i, i + 60))
  const rows = []
  await pool(batches, 10, async batch => {
    const data = await getJSON(`https://itunes.apple.com/lookup?country=${COUNTRY}&id=${batch.join(',')}`)
    for (const r of data?.results || []) {
      if (r.kind !== 'software') continue
      const id = String(r.trackId)
      if (!ids.has(id)) continue
      rows.push({
        id,
        name: r.trackName,
        seller: r.sellerName,
        genre: r.primaryGenreName,
        rating: r.averageUserRating ?? null,
        reviews: r.userRatingCount ?? 0,
        ratingCurrent: r.averageUserRatingForCurrentVersion ?? null,
        price: r.formattedPrice || 'Free',
        icon: r.artworkUrl100 || '',
        url: r.trackViewUrl,
        released: (r.releaseDate || '').slice(0, 10),
        updated: (r.currentVersionReleaseDate || '').slice(0, 10),
        version: r.version || '',
        description: (r.description || '').replace(/\s+/g, ' ').trim(),
        charts: ids.get(id).sort((a, b) => a.rank - b.rank),
      })
    }
  })
  return rows
}

// ---------------------------------------------------------------- step 4 -> 5
async function fetchReviews (app) {
  const negative = []
  let total = 0
  for (let page = 1; page <= REVIEW_PAGES; page++) {
    const url = `https://itunes.apple.com/${COUNTRY}/rss/customerreviews/page=${page}/id=${app.id}/sortby=mostrecent/json`
    const data = await getReviewJSON(url)
    await sleep(REVIEW_SPACING_MS)
    // First entry is the app itself, not a review.
    const list = asArray(data?.feed?.entry).filter(e => e['im:rating'])
    if (!list.length) break
    for (const e of list) {
      const stars = parseInt(e['im:rating']?.label, 10)
      if (!Number.isFinite(stars)) continue
      total++
      if (stars <= 3) {
        negative.push({
          stars,
          title: (e.title?.label || '').trim(),
          text: (e.content?.label || '').replace(/\s+/g, ' ').trim(),
        })
      }
    }
  }
  return { total, negative }
}

function analyseComplaints ({ total, negative }) {
  const counts = Object.fromEntries(THEMES.map(t => [t.key, 0]))
  const evidence = Object.fromEntries(THEMES.map(t => [t.key, []]))

  for (const r of negative) {
    const blob = `${r.title} ${r.text}`
    for (const t of THEMES) {
      if (!t.re.test(blob)) continue
      counts[t.key]++
      if (evidence[t.key].length < 3) {
        // Keep excerpts short: enough to show the pattern, not a copy of the review.
        const m = blob.match(t.re)
        const at = Math.max(0, blob.toLowerCase().indexOf((m?.[0] || '').toLowerCase()) - 55)
        let snip = blob.slice(at, at + 155).trim()
        if (at > 0) snip = '…' + snip
        if (at + 155 < blob.length) snip += '…'
        evidence[t.key].push({ stars: r.stars, snippet: snip })
      }
    }
  }

  const themes = THEMES
    .map(t => ({
      key: t.key, label: t.label, fix: t.fix,
      count: counts[t.key],
      share: negative.length ? counts[t.key] / negative.length : 0,
      evidence: evidence[t.key],
    }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count)

  return {
    sampled: total,
    negativeCount: negative.length,
    negativeShare: total ? negative.length / total : 0,
    themes,
  }
}

// Opportunity = proven money x concentrated, fixable pain x how bad the rating is.
// Deliberately explainable: every input is visible on the app's page.
function opportunityScore (app, analysis) {
  const best = app.charts[0]
  const rankScore = (CHART_LIMIT + 1 - Math.min(best.rank, CHART_LIMIT)) / CHART_LIMIT * (best.chart === 'Overall' ? 1.4 : 1)
  const painShare = analysis.negativeShare
  const ratingGap = Math.max(0, 5 - (app.rating ?? 5))
  // concentration: is the pain one fixable thing, or diffuse unhappiness?
  const top = analysis.themes[0]?.share ?? 0
  return Math.round(rankScore * painShare * ratingGap * (0.6 + 0.4 * top) * 1000)
}

// ---------------------------------------------------------------------- main
async function main () {
  console.log('1/4  pulling top-grossing charts (revenue proxy)…')
  const ids = await fetchCharts()
  console.log(`     ${ids.size} unique grossing apps`)

  console.log('2/4  resolving ratings…')
  const meta = await fetchMetadata(ids)
  console.log(`     ${meta.length} resolved`)

  const candidates = meta
    .filter(a => a.rating != null && a.reviews >= MIN_REVIEWS && a.rating <= MAX_RATING)
    .sort((a, b) => a.rating - b.rating)
  console.log(`3/4  ${candidates.length} candidates (>=${MIN_REVIEWS} reviews, <=${MAX_RATING}★) — mining complaints…`)

  mkdirSync(join(ROOT, 'data'), { recursive: true })
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {}
  const fresh = Date.now() - CACHE_TTL_DAYS * 864e5
  let done = 0, hits = 0, fetched = 0

  const apps = await pool(candidates, REVIEW_CONCURRENCY, async app => {
    let raw = cache[app.id]
    if (raw && raw.ts > fresh) {
      hits++
    } else {
      raw = { ts: Date.now(), ...(await fetchReviews(app)) }
      // Only cache a real sample — an empty result is usually throttling, not a quiet app.
      if (raw.total > 0) { cache[app.id] = raw; fetched++ }
    }
    if (++done % 10 === 0) {
      console.log(`     ${done}/${candidates.length}  (cached ${hits}, fetched ${fetched}, throttled ${throttleHits})`)
      writeFileSync(CACHE_PATH, JSON.stringify(cache))   // checkpoint: a kill never loses work
    }
    const analysis = analyseComplaints(raw)
    return { ...app, slug: `${slugify(app.name)}-${app.id}`, analysis, score: opportunityScore(app, analysis) }
  })
  writeFileSync(CACHE_PATH, JSON.stringify(cache))
  console.log(`     reviews: ${hits} from cache, ${fetched} newly fetched, ${throttleHits} throttle responses`)

  const usable = apps
    .filter(a => a.analysis.sampled >= 15 && a.analysis.themes.length > 0)
    .sort((a, b) => b.score - a.score)

  console.log(`4/4  ${usable.length} apps with usable complaint signal`)

  const payload = {
    generatedAt: new Date().toISOString(),
    country: COUNTRY,
    source: 'Apple RSS marketing feeds + iTunes Lookup API',
    filters: { minReviews: MIN_REVIEWS, maxRating: MAX_RATING, chartLimit: CHART_LIMIT },
    themes: THEMES.map(({ key, label, fix }) => ({ key, label, fix })),
    apps: usable,
  }
  writeFileSync(join(ROOT, 'data', 'apps.json'), JSON.stringify(payload))
  console.log('     wrote data/apps.json')

  console.log('\nTop 15 by opportunity score:')
  for (const a of usable.slice(0, 15)) {
    const t = a.analysis.themes[0]
    console.log(`  ${String(a.score).padStart(4)}  ${a.rating.toFixed(2)}★ ${String(a.reviews).padStart(8)}  ${a.charts[0].chart}#${a.charts[0].rank}  ${a.name.slice(0, 34).padEnd(34)} ${t.label} ${Math.round(t.share * 100)}%`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
