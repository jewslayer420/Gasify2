// TEMPORARY Facilito endpoint-discovery probe for Peru. Run from Render
// (Facilito is geo-fenced from the dev sandbox; Render's IP gets 200).
// Delete this file + its route once the Peru scraper is built.
//
// Established (v1-v4): Facilito liquid fuel is a Struts Post/Redirect/Get flow.
//   - GET buscadorEESS.jsp  -> sets JSESSIONID + SERVERID cookies, renders a
//     Peru map (<img usemap>) + <form name="form"> with 3 hidden fields:
//       departamento_elegido | nameRedirectfile=buscadorEESS | g-recaptcha-response
//   - Clicking a map region sets departamento_elegido, runs reCAPTCHA v3, and
//     POSTs to PreciosCombustibleAutomotorAction.do?method=inicio
//   - The action stores the dept in session and 302-redirects back to
//     buscadorEESS.jsp, which then renders the station table for that dept.
//
// v5 goal: (a) capture the map regions + inline scripts so we learn the exact
// departamento_elegido values; (b) run the FULL flow with real dept values and
// an EMPTY reCAPTCHA token, follow the redirect with the session cookie, and
// check whether the station table actually renders (= reCAPTCHA not enforced).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ORIGIN = 'https://www.facilito.gob.pe';
const EESS_PAGE = ORIGIN + '/facilito/pages/facilito/buscadorEESS.jsp';
const ACTION = ORIGIN + '/facilito/actions/PreciosCombustibleAutomotorAction.do?method=inicio';

async function fetchRaw(url, opts = {}) {
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'es-PE,es;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(opts.headers || {}),
    },
    body: opts.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(opts.timeout || 25000),
  });
  const text = await r.text();
  let setCookie = [];
  try { setCookie = r.headers.getSetCookie ? r.headers.getSetCookie() : []; } catch { /* noop */ }
  return { status: r.status, contentType: r.headers.get('content-type'), location: r.headers.get('location'), length: text.length, setCookie, text };
}

function cookieHeaderFrom(setCookieArr) {
  return (setCookieArr || []).map(c => c.split(';')[0]).filter(Boolean).join('; ');
}

function extractInlineScripts(html) {
  const inline = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/\bsrc\s*=/i.test(m[1] || '')) continue;
    const body = (m[2] || '').trim();
    if (body) inline.push(body);
  }
  return inline;
}

// Capture <area> tags (map regions) and any element wiring departamento_elegido.
function extractMapRegions(html) {
  const areas = [];
  const areaRe = /<area\b[^>]*>/gi;
  let m;
  while ((m = areaRe.exec(html)) !== null) {
    const a = m[0];
    areas.push({
      title: (a.match(/\b(?:data-title|title|alt)\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
      href: (a.match(/\bhref\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
      onclick: (a.match(/\bonclick\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
      dataAttrs: (a.match(/\bdata-[a-z-]+\s*=\s*["'][^"']*["']/gi) || []),
    });
    if (areas.length >= 30) break;
  }
  return areas;
}

function sniffResults(text) {
  const lower = text.toLowerCase();
  const tableIdx = text.search(/<table/i);
  const coordSamples = (text.match(/-?\d{1,2}\.\d{4,}/g) || []).slice(0, 8);
  // grab a chunk around the first table (or first coord) so we can design a parser
  let resultChunk = null;
  if (tableIdx >= 0) resultChunk = text.slice(tableIdx, tableIdx + 1200);
  else if (coordSamples.length) {
    const ci = text.indexOf(coordSamples[0]);
    resultChunk = text.slice(Math.max(0, ci - 400), ci + 400);
  }
  return {
    length: text.length,
    hasTable: tableIdx >= 0,
    rowCount: (text.match(/<tr\b/gi) || []).length,
    mentionsPrecio: lower.includes('precio'),
    mentionsLatLng: /lat(itud)?|lng|longitud/i.test(text),
    mentionsRazonSocial: /raz[oó]n\s*social/i.test(text),
    mentionsNoData: lower.includes('no se encontr') || lower.includes('sin resultado') || lower.includes('no existe'),
    coordSamples,
    resultChunk: resultChunk ? resultChunk.replace(/\s+/g, ' ').trim() : null,
  };
}

// Run POST(dept) -> follow 302 -> GET buscador with session cookie -> sniff.
async function runFlow(dept, recaptcha, baseCookie) {
  const params = new URLSearchParams({
    departamento_elegido: dept,
    nameRedirectfile: 'buscadorEESS',
    'g-recaptcha-response': recaptcha,
  });
  const post = await fetchRaw(ACTION, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': ORIGIN, 'Referer': EESS_PAGE,
      ...(baseCookie ? { 'Cookie': baseCookie } : {}),
    },
    body: params.toString(),
    timeout: 30000,
  });
  // merge any new cookies from the POST onto the base session
  const merged = [baseCookie, cookieHeaderFrom(post.setCookie)].filter(Boolean).join('; ');
  let followed = null;
  if (post.status >= 300 && post.status < 400 && post.location) {
    const loc = post.location.startsWith('http') ? post.location : ORIGIN + post.location;
    const g = await fetchRaw(loc, { headers: { 'Referer': EESS_PAGE, ...(merged ? { 'Cookie': merged } : {}) }, timeout: 30000 });
    followed = { url: loc, status: g.status, contentType: g.contentType, sniff: sniffResults(g.text), sample: g.text.slice(0, 400) };
  }
  return {
    dept, recaptchaSent: recaptcha ? 'nonempty' : 'EMPTY',
    post: { status: post.status, location: post.location, length: post.length },
    followed,
  };
}

async function probePeru() {
  const out = { ranAt: new Date().toISOString(), version: 'v7', steps: {}, flows: [] };

  // 1) GET page: cookies + map regions + inline scripts
  let cookie = '';
  let pageText = '';
  try {
    const page = await fetchRaw(EESS_PAGE);
    cookie = cookieHeaderFrom(page.setCookie);
    pageText = page.text;
    out.steps.getPage = {
      status: page.status, length: page.length,
      setCookie: page.setCookie.map(c => c.split(';')[0]),
      mapName: (pageText.match(/<map\b[^>]*\bname\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
      areas: extractMapRegions(pageText),
      inlineScripts: extractInlineScripts(pageText),
    };
  } catch (e) {
    out.steps.getPage = { error: e.cause ? (e.cause.code || e.cause.message) : e.message };
    return out;
  }

  // 2) Departamento codes come from href="javaScript:makeAction(NNNN)" on each
  //    map area. Build a name->code list and try Lima (most stations) + Amazonas.
  const codeMap = (out.steps.getPage.areas || [])
    .map(a => ({ title: a.title, code: (String(a.href || '').match(/makeAction\(\s*(\d+)\s*\)/) || [])[1] || null }))
    .filter(x => x.code);
  out.steps.codeMap = codeMap;
  const wanted = ['150000', '40000', '10000']; // Lima, Arequipa, Amazonas
  const present = codeMap.map(x => x.code);
  const candidates = [...new Set([...wanted.filter(c => present.includes(c)), ...present])].slice(0, 3);
  out.steps.candidates = candidates;

  // 3) Run the flow for Lima with EMPTY recaptcha, and return the FULL followed
  //    page so we can read how/where results render (or confirm it's a shell).
  try {
    const flow = await runFlow('150000', '', cookie);
    out.flows.push(flow);
  } catch (e) {
    out.flows.push({ dept: '150000', error: e.cause ? (e.cause.code || e.cause.message) : e.message });
  }
  // Full cold page body for offline reading (look for results container / 2nd form).
  out.fullPage = pageText;

  // 4) Brute a list of method= variants on the action; report status/type/len/sample.
  const methods = ['inicio', 'listar', 'listarEESS', 'buscar', 'buscarEESS', 'consultar',
    'consultarEESS', 'listarPrecios', 'obtenerEESS', 'eess', 'grid', 'datos', 'json', 'mapa',
    'getEESS', 'listarGrifos', 'precios'];
  out.methodProbe = [];
  for (const mth of methods) {
    const url = ORIGIN + '/facilito/actions/PreciosCombustibleAutomotorAction.do?method=' + mth;
    try {
      const r = await fetchRaw(url, { headers: { Referer: EESS_PAGE, ...(cookie ? { Cookie: cookie } : {}) }, timeout: 15000 });
      out.methodProbe.push({ mth, status: r.status, contentType: r.contentType, location: r.location, length: r.length, sample: r.length ? r.text.slice(0, 160).replace(/\s+/g, ' ').trim() : '' });
    } catch (e) {
      out.methodProbe.push({ mth, error: e.message });
    }
  }

  return out;
}

module.exports = { probePeru };
