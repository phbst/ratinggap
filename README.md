# RatingGap

**Find app ideas that already work.** Apps that rank on a US top-grossing chart have proven that people
will pay. Some of them are also rated badly. That distance — proven revenue, unhappy customers — is the
opening, and the one-star reviews tell you exactly what a better version has to fix.

RatingGap runs that search automatically on Apple's public data and publishes a teardown page for every
app it finds. No signup, no paywall, no account.

## The method

1. **Start from money, not ideas.** Pull the top 100 grossing apps in every App Store category.
2. **Sort by rating, ascending.** Keep the ones rated ≤ 4.6★ with at least 800 reviews.
3. **Read the one-star reviews.** Sample recent reviews for each candidate and cluster complaints into
   11 recurring, fixable patterns — paywalls, free-tier caps, ads, cancellation traps, bugs, data loss,
   confusing UX, support, forced accounts, wrong results, privacy.
4. **Rank the openings.** One explainable score per app:

   ```
   score = chart strength
         × share of sampled reviews that are negative
         × (5 − rating)
         × how concentrated the top complaint is
   ```

   High score = real money, unhappy users, bad rating, and *one* dominant cause rather than diffuse
   dissatisfaction. Diffuse unhappiness is hard to beat; a single dominant fixable cause is a product plan.

5. **Build the fix.** Each teardown ends with a ranked spec of what to change.

## Data

Everything comes from two public Apple endpoints, no key and no scraping:

- `itunes.apple.com/us/rss/topgrossingapplications/` — grossing charts (capped at 100 per category)
- `itunes.apple.com/lookup` — ratings, review counts, metadata
- `itunes.apple.com/us/rss/customerreviews/` — recent reviews

**Revenue is expressed as chart rank, not dollars.** Being on a US grossing chart puts an app far above the
"$50k/month" bar people usually screen for, but the exact figure is not public — so we show the rank instead
of inventing a number. Review excerpts are short quotations shown for research and link back to the listing.
Not affiliated with or endorsed by Apple Inc.

## Run it

```bash
npm run fetch    # pull charts, ratings and reviews -> data/apps.json
npm run build    # generate dist/
npm run serve    # preview at http://localhost:4321/ratinggap/
```

Build-time configuration, all optional:

| Variable | Default | Use |
| --- | --- | --- |
| `BASE_PATH` | `/ratinggap` | Set to `/` when serving from a domain root. Empty/unset keeps the default, because CI injects undefined variables as empty strings |
| `SITE_ORIGIN` | `https://phbst.github.io` | Origin used in canonicals and the sitemap |
| `GA_ID` | *(none)* | Google Analytics measurement id |

The GitHub Actions workflow rebuilds on push and re-pulls Apple data every Monday, so the rankings stay
current without anyone touching it.

## Structure

```
scripts/fetch.mjs   data pipeline: charts -> ratings -> review mining -> scoring
scripts/build.mjs   static site generator: teardowns, category hubs, complaint hubs, sitemap
src/style.css       one stylesheet, light + dark
src/app.js          client-side filter/sort (the first 300 cards are server-rendered)
data/apps.json      committed snapshot, so a push deploys without hitting Apple
```

## Licence

MIT for the code. The App Store data belongs to Apple and its developers.
