// TEMPORARY reachability + schema-discovery probe for Peru fuel data.
// Run from Render (Peru gov hosts are geo-fenced; the dev sandbox gets TLS RST / 403).
// Delete this file + its route once the Peru scraper is built.
//
// Reachability finding from dev sandbox (2026-06-09):
//   facilito.gob.pe (38.187.0.178)  -> ECONNRESET on TLS handshake
//   www.osinergmin.gob.pe           -> ECONNRESET
//   www.datosabiertos.gob.pe        -> TLS OK, but /api 403 Forbidden (nginx edge)
// This probe re-tests all three from Render's IP and tries to capture real schemas.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FACILITO_PAGE = 'https://www.facilito.gob.pe/facilito/pages/facilito/buscadorEESS.jsp';
const FACILITO_ORIGIN = 'https://www.facilito.gob.pe';

async function attempt(name, url, { method = 'GET', headers = {}, body, timeout = 25000, as = 'text' } = {}) {
  const out = { name, url, method };
  try {
    const r = await fetch(url, {
      method,
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-PE,es;q=0.9', ...headers },
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    });
    out.status = r.status;
    out.contentType = r.headers.get('content-type');
    out.server = r.headers.get('server');
    const txt = await r.text();
    out.length = txt.length;
    if (as === 'json') {
      try { out.json = JSON.parse(txt); } catch { out.parseError = true; out.sample = txt.slice(0, 800); }
    } else {
      out.sample = txt.slice(0, 1500);
      out._full = txt; // internal, stripped before returning unless needed
    }
  } catch (err) {
    out.error = err.cause ? (err.cause.code || err.cause.message) : err.message;
  }
  return out;
}

// Pull candidate backend endpoints out of HTML + JS source.
function extractEndpoints(text) {
  const hints = new Set();
  const patterns = [
    /(?:url|action|href|src)\s*[:=]\s*["'`]([^"'`]+)["'`]/gi,
    /(?:fetch|ajax|get|post|load)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /["'`](\/facilito\/[^"'`]+)["'`]/gi,
    /["'`]([^"'`]*(?:listar|buscar|consultar|eess|estacion|grifo|precio)[^"'`]*\.(?:do|json|jsp|action))["'`]/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const v = m[1];
      if (/^(https?:)?\/\/|^\/|\.(do|json|jsp|action)$/i.test(v) && v.length < 200) hints.add(v);
    }
  }
  return [...hints];
}

async function probePeru() {
  const results = { ranAt: new Date().toISOString(), reachability: [], discovery: {}, datosabiertos: {} };

  // 1) Raw reachability to all three hosts
  const roots = [
    ['facilito-root', 'https://www.facilito.gob.pe/'],
    ['osinergmin-root', 'https://www.osinergmin.gob.pe/'],
    ['datosabiertos-root', 'https://www.datosabiertos.gob.pe/'],
  ];
  for (const [name, url] of roots) {
    const a = await attempt(name, url);
    delete a._full;
    results.reachability.push(a);
  }

  // 2) Facilito page → extract endpoint hints, then fetch same-origin JS and extract more
  const page = await attempt('facilito-page', FACILITO_PAGE);
  const pageText = page._full || '';
  delete page._full;
  results.discovery.page = page;

  if (pageText) {
    const hints = extractEndpoints(pageText);
    results.discovery.pageHints = hints;
    // Find same-origin .js bundles and mine them too
    const jsFiles = hints.filter(h => /\.js(\?|$)/i.test(h)).slice(0, 4);
    results.discovery.jsScanned = [];
    for (const js of jsFiles) {
      const jsUrl = js.startsWith('http') ? js : FACILITO_ORIGIN + (js.startsWith('/') ? js : '/facilito/' + js);
      const jr = await attempt(`js:${js}`, jsUrl, { timeout: 20000 });
      const jsHints = jr._full ? extractEndpoints(jr._full) : [];
      delete jr._full;
      results.discovery.jsScanned.push({ url: jsUrl, status: jr.status, length: jr.length, hints: jsHints });
    }
  }

  // 3) datosabiertos CKAN — search + dump resources of the daily price dataset, sample columns
  const search = await attempt('ckan-search',
    'https://www.datosabiertos.gob.pe/api/3/action/package_search?q=precios+combustibles&rows=8',
    { as: 'json' });
  delete search._full;
  results.datosabiertos.search = {
    status: search.status, error: search.error, server: search.server,
    sample: search.sample,
    datasets: search.json?.result?.results?.map(p => ({
      name: p.name,
      title: p.title,
      org: p.organization?.title,
      resources: p.resources?.map(r => ({ format: r.format, name: r.name, url: r.url })),
    })),
  };

  // If we found a CSV/JSON resource, fetch the head to capture columns/keys
  const firstDataset = search.json?.result?.results?.find(p =>
    p.resources?.some(r => /csv|json/i.test(r.format || '')));
  const res = firstDataset?.resources?.find(r => /csv|json/i.test(r.format || ''));
  if (res?.url) {
    const head = await attempt('ckan-resource-head', res.url, { timeout: 30000 });
    results.datosabiertos.resourceProbe = {
      url: res.url, format: res.format, status: head.status,
      contentType: head.contentType, length: head.length,
      sample: (head._full || head.sample || '').slice(0, 2000),
      error: head.error,
    };
  }

  return results;
}

module.exports = { probePeru };
