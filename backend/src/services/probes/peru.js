// TEMPORARY Peru data-source probe. Run from Render (Osinergmin/Facilito are
// geo-fenced from the dev sandbox; Render's IP gets 200).
// Delete this file + its route once the Peru scraper is built (or Peru is dropped).
//
// Established (v1-v7): Facilito's liquid-fuel search (buscadorEESS.jsp ->
// PreciosCombustibleAutomotorAction.do?method=inicio) is gated by ENFORCED
// reCAPTCHA v3 — an empty token always 302s back to the dept selector, so a
// plain-HTTP scraper of Facilito is impossible.
//
// v8 goal: hunt for a captcha-free bulk source. Harvest Osinergmin's "PRICE" /
// SCOP registro de precios (linked in the Facilito footer) and nearby portals
// for downloadable data (CSV/XLSX) or open query endpoints.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const SEEDS = [
  'https://www.osinergmin.gob.pe/empresas/hidrocarburos/Paginas/SCOP-DOCS/scop_docs.htm',
  'https://www.facilito.gob.pe/facilito/pages/facilito/menuPrecios.jsp',
  'https://www.osinergmin.gob.pe/seccion/institucional/regulacion-tarifaria/precios-referencia-combustibles',
  'https://www.gob.pe/osinergmin',
];

async function fetchRaw(url, opts = {}) {
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'es-PE,es;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(opts.headers || {}),
    },
    redirect: opts.redirect || 'follow',
    signal: AbortSignal.timeout(opts.timeout || 25000),
  });
  let text = '';
  const ct = r.headers.get('content-type') || '';
  // only read body for textual responses
  if (/text|html|json|xml|javascript/i.test(ct) || !ct) text = await r.text();
  return { status: r.status, url: r.url, contentType: ct, location: r.headers.get('location'), length: text.length, text };
}

// Harvest anchors / script srcs / form actions, keeping ones that look like data.
function harvestLinks(html, baseUrl) {
  const DATA_RE = /(\.csv|\.xlsx?|\.json|\.zip|\.pdf|descarga|download|datos|dataset|open[-_]?data|datosabiertos|api|consulta|reporte|report|precio|price|combustible|grifo|estacion|eess|\.do\b|\.aspx|\.jsp)/i;
  const out = { all: 0, interesting: [] };
  const seen = new Set();
  const push = (href, text) => {
    if (!href) return;
    out.all++;
    if (!DATA_RE.test(href) && !(text && DATA_RE.test(text))) return;
    let abs = href;
    try { abs = new URL(href, baseUrl).href; } catch { /* keep raw */ }
    if (seen.has(abs)) return;
    seen.add(abs);
    if (out.interesting.length < 40) out.interesting.push({ href: abs, text: (text || '').replace(/\s+/g, ' ').trim().slice(0, 60) });
  };
  let m;
  const aRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = aRe.exec(html)) !== null) push(m[1], m[2].replace(/<[^>]+>/g, ' '));
  const srcRe = /<(?:script|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  while ((m = srcRe.exec(html)) !== null) push(m[1], '');
  const formRe = /<form\b[^>]*\baction\s*=\s*["']([^"']+)["']/gi;
  while ((m = formRe.exec(html)) !== null) push(m[1], '[form action]');
  return out;
}

async function probePeru() {
  const out = { ranAt: new Date().toISOString(), version: 'v8', note: 'Facilito reCAPTCHA v3 enforced; hunting captcha-free bulk source', seeds: [] };

  for (const seed of SEEDS) {
    const r = { seed };
    try {
      const resp = await fetchRaw(seed, { timeout: 25000 });
      r.status = resp.status;
      r.finalUrl = resp.url;
      r.contentType = resp.contentType;
      r.length = resp.length;
      if (resp.text) {
        const h = harvestLinks(resp.text, resp.url);
        r.totalLinks = h.all;
        r.interesting = h.interesting;
        r.titleSample = (resp.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || null;
      }
    } catch (e) {
      r.error = e.cause ? (e.cause.code || e.cause.message) : e.message;
    }
    out.seeds.push(r);
  }

  return out;
}

module.exports = { probePeru };
