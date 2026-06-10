// TEMPORARY Facilito endpoint-discovery probe for Peru. Run from Render
// (Facilito is geo-fenced from the dev sandbox; Render's IP gets 200).
// Delete this file + its route once the Peru scraper is built.
//
// Established (v1-v3):
//   - Facilito liquid-fuel data is NOT a JSON API. buscadorEESS.jsp carries a
//     <form name="form"> that POSTs to
//       /facilito/actions/PreciosCombustibleAutomotorAction.do?method=inicio
//     and the server renders an HTML results page. reCAPTCHA v3 runs on load
//     (siteKey 6Le5C4cf..., action 'PreciosCombustibleAutomotorAction') and
//     stuffs the token into hidden field g-recaptcha-response.
//
// v4 goal: run the real flow from Render's IP and find out whether the
// reCAPTCHA token is ENFORCED:
//   1. GET buscadorEESS.jsp, keep the JSESSIONID cookie.
//   2. Parse the <form>: list every input/select name + select option values.
//   3. POST to the action with discovered fields (first option of each select,
//      empty g-recaptcha-response) and report status + body sample.
//   4. Sniff the body for a results table / station rows / lat-lng.

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
  return {
    status: r.status,
    contentType: r.headers.get('content-type'),
    location: r.headers.get('location'),
    length: text.length,
    setCookie,
    text,
  };
}

// JSESSIONID=...; strip attributes.
function cookieHeaderFrom(setCookieArr) {
  return (setCookieArr || [])
    .map(c => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

// Find the first <form ...>...</form> and return its outer HTML.
function extractForm(html) {
  const m = html.match(/<form\b[\s\S]*?<\/form>/i);
  return m ? m[0] : '';
}

// List input/select/button fields inside a form chunk.
function extractFields(formHtml) {
  const fields = [];
  // inputs
  const inputRe = /<input\b([^>]*)>/gi;
  let m;
  while ((m = inputRe.exec(formHtml)) !== null) {
    const a = m[1];
    fields.push({
      tag: 'input',
      type: (a.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || 'text',
      name: (a.match(/\bname\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
      id: (a.match(/\bid\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
      value: (a.match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
    });
  }
  // selects with their option values
  const selRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((m = selRe.exec(formHtml)) !== null) {
    const a = m[1];
    const body = m[2];
    const opts = [];
    const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let om;
    while ((om = optRe.exec(body)) !== null) {
      opts.push({
        value: (om[1].match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [])[1] ?? null,
        label: om[2].replace(/\s+/g, ' ').trim().slice(0, 40),
      });
      if (opts.length >= 12) break;
    }
    fields.push({
      tag: 'select',
      name: (a.match(/\bname\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
      id: (a.match(/\bid\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
      optionCount: (body.match(/<option\b/gi) || []).length,
      options: opts,
    });
  }
  // form action/method attrs
  const formTag = (formHtml.match(/<form\b[^>]*>/i) || [''])[0];
  return {
    formAction: (formTag.match(/\baction\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
    formMethod: (formTag.match(/\bmethod\s*=\s*["']([^"']*)["']/i) || [])[1] || 'get',
    formName: (formTag.match(/\bname\s*=\s*["']([^"']*)["']/i) || [])[1] || null,
    fields,
  };
}

// Look for evidence of station results in a response body.
function sniffResults(text) {
  const lower = text.toLowerCase();
  return {
    hasTable: /<table/i.test(text),
    rowCount: (text.match(/<tr\b/gi) || []).length,
    mentionsPrecio: lower.includes('precio'),
    mentionsLatLng: /lat(itud)?|lng|longitud/i.test(text),
    mentionsRazonSocial: lower.includes('razon') || lower.includes('razón'),
    mentionsNoData: lower.includes('no se encontr') || lower.includes('sin resultado'),
    coordSamples: (text.match(/-?\d{1,2}\.\d{4,}/g) || []).slice(0, 6),
    sample: text.slice(0, 600),
  };
}

async function probePeru() {
  const out = { ranAt: new Date().toISOString(), version: 'v4', steps: {} };

  // 1) GET the search page, capture cookie + form structure
  let cookie = '';
  let form = null;
  try {
    const page = await fetchRaw(EESS_PAGE);
    cookie = cookieHeaderFrom(page.setCookie);
    const formHtml = extractForm(page.text);
    form = extractFields(formHtml);
    out.steps.getPage = {
      status: page.status, contentType: page.contentType, length: page.length,
      setCookie: page.setCookie.map(c => c.split(';')[0]),
      formAction: form.formAction, formMethod: form.formMethod, formName: form.formName,
      fields: form.fields,
    };
  } catch (e) {
    out.steps.getPage = { error: e.cause ? (e.cause.code || e.cause.message) : e.message };
    return out;
  }

  // 2) Build a form body: first non-empty option for each select, blank token.
  const params = new URLSearchParams();
  for (const f of form.fields) {
    if (!f.name) continue;
    if (f.tag === 'select') {
      const opt = (f.options || []).find(o => o.value && o.value !== '' && o.value !== '0') || (f.options || [])[0];
      params.set(f.name, opt ? (opt.value ?? '') : '');
    } else if (f.tag === 'input') {
      if (f.type === 'hidden' || f.type === 'text') params.set(f.name, f.value || '');
    }
  }
  // ensure recaptcha field exists but empty (test enforcement)
  if (!params.has('g-recaptcha-response')) params.set('g-recaptcha-response', '');
  out.steps.postBody = params.toString();

  // 3) POST the action with the cookie + referer
  try {
    const resp = await fetchRaw(ACTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': ORIGIN,
        'Referer': EESS_PAGE,
        ...(cookie ? { 'Cookie': cookie } : {}),
      },
      body: params.toString(),
      timeout: 30000,
    });
    out.steps.postAction = {
      status: resp.status, contentType: resp.contentType, location: resp.location,
      length: resp.length, sniff: sniffResults(resp.text),
    };
  } catch (e) {
    out.steps.postAction = { error: e.cause ? (e.cause.code || e.cause.message) : e.message };
  }

  // 4) For comparison, a plain GET of the action (no cookie) — what we tried before
  try {
    const g = await fetchRaw(ACTION, { headers: { 'Referer': EESS_PAGE } });
    out.steps.getActionNoSession = { status: g.status, contentType: g.contentType, location: g.location, length: g.length, sample: g.text.slice(0, 300) };
  } catch (e) {
    out.steps.getActionNoSession = { error: e.message };
  }

  return out;
}

module.exports = { probePeru };
