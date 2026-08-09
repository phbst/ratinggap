// Client-side filter/sort for the finder. The first 300 cards are server-rendered
// so the page is useful (and indexable) with JS off; this takes over on interaction.
(function () {
  var APPS = window.__APPS__ || []
  var results = document.getElementById('results')
  var countEl = document.getElementById('count')
  var moreEl = document.getElementById('more')
  if (!results || !APPS.length) return

  var BASE = (document.querySelector('link[rel=stylesheet]').getAttribute('href') || '').replace(/\/style\.css$/, '')
  var PAGE = 60
  var shown = PAGE
  var current = APPS

  var els = {
    genre: document.getElementById('f-genre'),
    theme: document.getElementById('f-theme'),
    rating: document.getElementById('f-rating'),
    sort: document.getElementById('f-sort'),
    q: document.getElementById('f-q'),
  }

  function esc (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function tier (a) {
    if (a.c === 'Overall') return a.k <= 25 ? 'Top 25 grossing overall' : 'Top 100 grossing overall'
    if (a.k <= 10) return 'Top 10 in category'
    if (a.k <= 50) return 'Top 50 in category'
    return 'Top 100 in category'
  }

  function card (a) {
    return '<article class="card">' +
      '<a class="card-main" href="' + BASE + '/app/' + esc(a.s) + '/">' +
        '<img src="' + esc(a.ic) + '" alt="" width="56" height="56" loading="lazy">' +
        '<div class="card-id"><h2>' + esc(a.n) + '</h2>' +
        '<p class="seller">' + esc(a.se) + ' · ' + esc(a.g) + '</p></div>' +
        '<div class="score" title="Opportunity score">' + a.sc + '</div>' +
      '</a>' +
      '<dl class="stats">' +
        '<div><dt>Rating</dt><dd class="bad">' + a.r.toFixed(2) + '★</dd></div>' +
        '<div><dt>Reviews</dt><dd>' + a.rv.toLocaleString('en-US') + '</dd></div>' +
        '<div><dt>Revenue</dt><dd>' + tier(a) + '</dd></div>' +
      '</dl>' +
      (a.t ? '<p class="top-theme"><a href="' + BASE + '/complaint/' + esc(a.t) + '/">' +
        esc(a.tl) + '</a> in ' + a.tp + '% of negative reviews</p>' : '') +
    '</article>'
  }

  function apply () {
    var genre = els.genre.value
    var theme = els.theme.value
    var maxRating = parseFloat(els.rating.value)
    var sort = els.sort.value
    var q = els.q.value.trim().toLowerCase()

    current = APPS.filter(function (a) {
      if (genre && a.g !== genre) return false
      if (theme && a.t !== theme) return false
      if (a.r > maxRating) return false
      if (q && (a.n + ' ' + a.se).toLowerCase().indexOf(q) === -1) return false
      return true
    })

    current.sort(function (x, y) {
      if (sort === 'rating') return x.r - y.r
      if (sort === 'reviews') return y.rv - x.rv
      if (sort === 'rank') return (x.c === 'Overall' ? 0 : 1000) + x.k - ((y.c === 'Overall' ? 0 : 1000) + y.k)
      return y.sc - x.sc
    })

    shown = PAGE
    render()
  }

  function render () {
    var slice = current.slice(0, shown)
    results.innerHTML = slice.length
      ? slice.map(card).join('')
      : '<p class="count">No apps match those filters. Try raising the max rating or clearing the search.</p>'
    countEl.textContent = current.length === 1 ? '1 app' : current.length.toLocaleString('en-US') + ' apps'
    moreEl.innerHTML = current.length > shown
      ? '<button type="button">Show ' + Math.min(PAGE, current.length - shown) + ' more</button>'
      : ''
  }

  moreEl.addEventListener('click', function (e) {
    if (e.target.tagName !== 'BUTTON') return
    shown += PAGE
    render()
  })

  var t
  Object.keys(els).forEach(function (k) {
    els[k].addEventListener(k === 'q' ? 'input' : 'change', function () {
      clearTimeout(t)
      t = setTimeout(apply, k === 'q' ? 140 : 0)
    })
  })

  apply()
})()
