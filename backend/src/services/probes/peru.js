// TEMPORARY Facilito endpoint-discovery probe for Peru. Run from Render
// (Facilito is geo-fenced from the dev sandbox; Render's IP gets 200).
// Delete this file + its route once the Peru scraper is built.
//
// Established so far:
//   - Render reaches facilito.gob.pe (200); datosabiertos CKAN is 403 everywhere.
//   - Facilito is a Java Struts app. buscadorEESS.jsp (liquid fuels) links to
//     /facilito/actions/PreciosCombustibleAutomotorAction.do?method=inicio
//     and the page carries reCAPTCHA v3 (render=6Le5C4cf...).
//
// v3 goal: load BOTH the jsp shell and the automotor action page, capture
// every inline <script> + same-origin app JS bundle, and surface the exact
// AJAX call (url + method=) that returns the station list with prices+lat/lng.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ORIGIN = 'https://www.facilito.gob.pe';
const TARGETS = [
  { name: 'buscadorEESS.jsp', url: ORIGIN + '/facilito/pages/facilito/buscadorEESS.jsp' },
  { name: 'PreciosCombustibleAutomotorAction.do?method=inicio', url: ORIGIN + '/facilito/actions/PreciosCombustibleAutomotorAction.do?method=inicio' },
];

async function fetchText(url, opts = {}) {
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'es-PE,es;q=0.9',
      'Referer': ORIGIN + '/facilito/pages/facilito/buscadorEESS.jsp',
      'X-Requested-With': 'XMLHttpRequest',
      ...(opts.headers || {}),
    },
    body: opts.body,
    redirect: 'follow',
    signal: AbortSignal.timeout(opts.timeout || 25000),
  });
  const text = await r.text();
  return { status: r.status, contentType: r.headers.get('content-type'), length: text.length, text };
}

// Pull <script> tags: external srcs and inline bodies.
function extractScripts(html) {
  const srcs = [];
  const inline = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    const srcM = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (srcM) srcs.push(srcM[1]);
    else if (body.trim().length > 0) inline.push(body.trim());
  }
  return { srcs, inline };
}

// Pull every .do action reference with the method= it is called with, plus the
// surrounding AJAX verb when detectable. This is the highest-signal extraction.
function extractDoCalls(text) {
  const calls = [];
  const re = /([A-Za-z0-9_\/.\-]*Action\.do(?:\?[A-Za-z0-9_=&%.\-]*)?)/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(text)) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    calls.push({ url, ctx: text.slice(Math.max(0, m.index - 80), m.index + url.length + 40).replace(/\s+/g, ' ').trim() });
    if (calls.length >= 40) break;
  }
  return calls;
}

// Return short context windows around interesting tokens in JS/HTML source.
function findSnippets(text, label) {
  const tokens = ['.do', 'ajax', '$.post', '$.get', '$.ajax', 'fetch(', 'url:', 'data:', 'method=', 'method:',
    'listar', 'buscar', 'consultar', 'EESS', 'estacion', 'grifo', 'precio', 'mapify',
    'grecaptcha', 'recaptcha', 'execute(', 'token'];
  const hits = [];
  const lower = text.toLowerCase();
  for (const tok of tokens) {
    let from = 0;
    const t = tok.toLowerCase();
    for (let n = 0; n < 6; n++) {
      const idx = lower.indexOf(t, from);
      if (idx === -1) break;
      hits.push({ tok, snippet: text.slice(Math.max(0, idx - 60), idx + 120).replace(/\s+/g, ' ').trim() });
      from = idx + t.length;
    }
  }
  return { label, count: hits.length, hits: hits.slice(0, 30) };
}

async function probeTarget(target) {
  const out = { name: target.name, url: target.url, page: {}, doCalls: [], inlineScans: [], jsScans: [] };

  let html = '';
  try {
    const page = await fetchText(target.url);
    html = page.text;
    out.page = { status: page.status, contentType: page.contentType, length: page.length };
  } catch (e) {
    out.page = { error: e.cause ? (e.cause.code || e.cause.message) : e.message };
    return out;
  }

  // Highest-signal: every *Action.do reference anywhere in the page HTML/JS.
  out.doCalls = extractDoCalls(html);

  const { srcs, inline } = extractScripts(html);
  out.scripts = { externalCount: srcs.length, srcs, inlineCount: inline.length };

  for (let i = 0; i < inline.length; i++) {
    const scan = findSnippets(inline[i], `inline#${i} (len ${inline[i].length})`);
    if (scan.count > 0) {
      scan.doCalls = extractDoCalls(inline[i]);
      out.inlineScans.push(scan);
    }
  }

  // Same-origin app JS bundles (skip vendor libs).
  const localJs = srcs
    .filter(s => !/^https?:\/\//i.test(s) || s.startsWith(ORIGIN))
    .filter(s => /\.js(\?|$)/i.test(s))
    .filter(s => !/(jquery|bootstrap|aos|boxicons|datatables|popper|mapify\.min)/i.test(s))
    .slice(0, 10);
  for (const s of localJs) {
    const url = s.startsWith('http') ? s : ORIGIN + (s.startsWith('/') ? s : '/facilito/pages/facilito/' + s);
    try {
      const js = await fetchText(url, { timeout: 20000 });
      const scan = findSnippets(js.text, url);
      scan.status = js.status;
      scan.length = js.length;
      scan.doCalls = extractDoCalls(js.text);
      out.jsScans.push(scan);
    } catch (e) {
      out.jsScans.push({ url, error: e.message });
    }
  }

  return out;
}

async function probePeru() {
  const out = { ranAt: new Date().toISOString(), version: 'v3', targets: [] };
  for (const t of TARGETS) {
    out.targets.push(await probeTarget(t));
  }
  return out;
}

module.exports = { probePeru };
