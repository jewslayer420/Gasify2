// TEMPORARY Facilito endpoint-discovery probe for Peru. Run from Render
// (Facilito is geo-fenced from the dev sandbox; Render's IP gets 200).
// Delete this file + its route once the Peru scraper is built.
//
// Already established (2026-06-09): Render reaches facilito.gob.pe (200);
// datosabiertos CKAN is 403 everywhere. Facilito is a Java Struts app —
// backend actions at /facilito/actions/PreciosMinoristaAction.do?method=...
// This probe finds the exact AJAX call buscadorEESS.jsp makes for the
// liquid-fuel station list (prices + lat/lng).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ORIGIN = 'https://www.facilito.gob.pe';
const EESS_PAGE = ORIGIN + '/facilito/pages/facilito/buscadorEESS.jsp';

async function fetchText(url, opts = {}) {
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-PE,es;q=0.9', ...(opts.headers || {}) },
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

// Return short context windows around interesting tokens in JS/HTML source.
function findSnippets(text, label) {
  const tokens = ['.do', 'ajax', '$.post', '$.get', '$.ajax', 'fetch(', 'url:', 'method=', 'method:',
    'listar', 'buscar', 'consultar', 'EESS', 'estacion', 'grifo', 'precio', 'mapify', 'grecaptcha', 'recaptcha'];
  const hits = [];
  const lower = text.toLowerCase();
  for (const tok of tokens) {
    let from = 0;
    const t = tok.toLowerCase();
    for (let n = 0; n < 6; n++) { // up to 6 hits per token
      const idx = lower.indexOf(t, from);
      if (idx === -1) break;
      hits.push({ tok, snippet: text.slice(Math.max(0, idx - 60), idx + 100).replace(/\s+/g, ' ').trim() });
      from = idx + t.length;
    }
  }
  return { label, count: hits.length, hits: hits.slice(0, 40) };
}

async function probePeru() {
  const out = { ranAt: new Date().toISOString(), eessPage: {}, scripts: {}, jsScans: [], pageInlineScans: [] };

  // 1) The liquid-fuel station search page
  let html = '';
  try {
    const page = await fetchText(EESS_PAGE);
    html = page.text;
    out.eessPage = { status: page.status, contentType: page.contentType, length: page.length };
  } catch (e) {
    out.eessPage = { error: e.cause ? (e.cause.code || e.cause.message) : e.message };
    return out;
  }

  // 2) Scripts: external srcs + inline bodies
  const { srcs, inline } = extractScripts(html);
  out.scripts = { externalCount: srcs.length, srcs, inlineCount: inline.length };

  // Scan inline scripts for the AJAX call (often inline in the JSP)
  for (let i = 0; i < inline.length; i++) {
    const scan = findSnippets(inline[i], `inline#${i} (len ${inline[i].length})`);
    if (scan.count > 0) out.pageInlineScans.push(scan);
  }

  // 3) Fetch local same-origin JS bundles and scan them (skip big vendor libs)
  const localJs = srcs
    .filter(s => !/^https?:\/\//i.test(s) || s.startsWith(ORIGIN))
    .filter(s => /\.js(\?|$)/i.test(s))
    .filter(s => !/(jquery|bootstrap|aos|boxicons|datatables|popper)/i.test(s)) // skip vendor libs
    .slice(0, 8);
  for (const s of localJs) {
    const url = s.startsWith('http') ? s : ORIGIN + (s.startsWith('/') ? s : '/facilito/pages/facilito/' + s);
    try {
      const js = await fetchText(url, { timeout: 20000 });
      out.jsScans.push({ url, status: js.status, length: js.length, ...findSnippets(js.text, url) });
    } catch (e) {
      out.jsScans.push({ url, error: e.message });
    }
  }

  return out;
}

module.exports = { probePeru };
