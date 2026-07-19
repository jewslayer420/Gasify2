'use client';
import { useEffect, useRef } from 'react';
import styles from './ScrollStation.module.css';

// Scroll-scrubbed night forecourt (pinned stage). Scroll powers the station
// on, drives the car in, and rolls both LED fuel rows from expensive red to
// cheap green. All per-frame motion is imperative (refs + rAF). The scroll
// listener captures on document because globals.css makes BODY the scroller.
// Reduced motion renders the assembled final scene.
//
// Story prices: real diesel/95 medians (DE vs CZ), refresh occasionally.
const DIESEL_HIGH = 2.09, DIESEL_LOW = 1.52;
const SP95_HIGH = 1.86, SP95_LOW = 1.61;
const TANK_L = 50;

const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => t * t * (3 - 2 * t);
const seg = (p, a, b) => clamp01((p - a) / (b - a));

function ledColor(price) {
  if (price <= 1.60) return '#37D3A0';
  if (price <= 1.90) return '#E8A23D';
  return '#E25A5A';
}
// Deterministic power-up flicker: stutters between 0.1..0.85 of the band.
function flicker(t) {
  if (t <= 0) return 0;
  if (t >= 0.85) return 1;
  const buzz = Math.sin(t * 61) * Math.sin(t * 23 + 1.7);
  return clamp01(t * 1.1 + buzz * 0.35 * (1 - t));
}

export default function ScrollStation() {
  const wrapRef = useRef(null);
  const refs = {
    car: useRef(null), wheelA: useRef(null), wheelB: useRef(null),
    beam: useRef(null), brake: useRef(null), shadow: useRef(null),
    glow: useRef(null), cones: useRef(null), trim: useRef(null), brand: useRef(null),
    dieselLed: useRef(null), sp95Led: useRef(null), pumpLedA: useRef(null), pumpLedB: useRef(null),
    gauge: useRef(null), saved: useRef(null),
  };
  const copyRefs = [useRef(null), useRef(null), useRef(null)];

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const R = k => refs[k].current;

    function render(p) {
      // ── Power-up: canopy lights, cones, brand, sign flicker ──
      const power = flicker(seg(p, 0.03, 0.3));
      if (R('glow')) R('glow').style.opacity = power * 0.9;
      if (R('cones')) R('cones').style.opacity = power * 0.55;
      if (R('trim')) R('trim').style.opacity = 0.15 + power * 0.85;
      if (R('brand')) R('brand').style.opacity = 0.25 + power * 0.75;

      // ── Car drives in, brakes at the pumps ──
      const drive = ease(seg(p, 0.16, 0.52));
      const carX = -340 + drive * 700; // front bumper ends up beside pump 1
      if (R('car')) R('car').setAttribute('transform', `translate(${carX} 0)`);
      const deg = (carX + 340) * 2.6;
      if (R('wheelA')) R('wheelA').setAttribute('transform', `rotate(${deg} 60 636)`);
      if (R('wheelB')) R('wheelB').setAttribute('transform', `rotate(${deg} 196 636)`);
      if (R('beam')) R('beam').style.opacity = drive > 0.02 && drive < 0.97 ? 0.65 : 0;
      if (R('brake')) R('brake').style.opacity = seg(p, 0.46, 0.5) * (1 - seg(p, 0.56, 0.62));
      if (R('shadow')) R('shadow').style.opacity = 0.5;

      // ── LED rows roll down as the car arrives ──
      const roll = ease(seg(p, 0.4, 0.66));
      const diesel = DIESEL_HIGH + (DIESEL_LOW - DIESEL_HIGH) * roll;
      const sp95 = SP95_HIGH + (SP95_LOW - SP95_HIGH) * roll;
      const set = (ref, val) => {
        if (!ref) return;
        ref.textContent = val.toFixed(2);
        const c = ledColor(val);
        ref.style.fill = c;
        ref.style.filter = `drop-shadow(0 0 5px ${c})`;
        ref.style.opacity = 0.15 + power * 0.85;
      };
      set(R('dieselLed'), diesel);
      set(R('sp95Led'), sp95);
      set(R('pumpLedA'), diesel);
      set(R('pumpLedB'), sp95);

      // ── Fill-up: gauge + savings ──
      const fill = ease(seg(p, 0.64, 0.9));
      if (R('gauge')) R('gauge').style.strokeDashoffset = 126 * (1 - fill);
      if (R('saved')) R('saved').textContent = `€${((DIESEL_HIGH - DIESEL_LOW) * TANK_L * fill).toFixed(2)}`;

      // ── Copy beats ──
      const windows = [[0.02, 0.09, 0.26, 0.36], [0.32, 0.42, 0.56, 0.66], [0.62, 0.74, 1, 1.01]];
      copyRefs.forEach((ref, i) => {
        if (!ref.current) return;
        const [a, b, c, d] = windows[i];
        const vis = p < a ? 0 : p < b ? ease(seg(p, a, b)) : p < c ? 1 : 1 - ease(seg(p, c, d));
        ref.current.style.opacity = vis;
        ref.current.style.transform = `translateY(${(1 - vis) * 22}px)`;
        ref.current.style.pointerEvents = vis > 0.5 ? 'auto' : 'none';
      });
    }

    if (reduced) { render(1); return; }
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        render(clamp01(-rect.top / Math.max(1, el.offsetHeight - window.innerHeight)));
      });
    }
    onScroll();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={styles.stage} ref={wrapRef} aria-label="How Gasify saves you money at the pump">
      <div className={styles.sticky}>
        <svg className={styles.scene} viewBox="0 0 1440 720" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <defs>
            <linearGradient id="st-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#04060A" />
              <stop offset="0.75" stopColor="#080B12" />
              <stop offset="1" stopColor="#0C1019" />
            </linearGradient>
            <radialGradient id="st-glow" cx="0.5" cy="0.1" r="0.9">
              <stop offset="0" stopColor="#37D3A0" stopOpacity="0.32" />
              <stop offset="0.5" stopColor="#37D3A0" stopOpacity="0.08" />
              <stop offset="1" stopColor="#37D3A0" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="st-cone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#CFF5E6" stopOpacity="0.28" />
              <stop offset="1" stopColor="#CFF5E6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="st-beam" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#F2ECCF" stopOpacity="0.5" />
              <stop offset="1" stopColor="#F2ECCF" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="st-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#22304A" />
              <stop offset="1" stopColor="#0D1119" />
            </linearGradient>
            <linearGradient id="st-road" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0A0D14" />
              <stop offset="1" stopColor="#06080D" />
            </linearGradient>
            <radialGradient id="st-brake" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#E25A5A" stopOpacity="0.55" />
              <stop offset="1" stopColor="#E25A5A" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Sky, moon, stars */}
          <rect width="1440" height="720" fill="url(#st-sky)" />
          <path d="M1230 96 a30 30 0 1 0 22 50 a25 25 0 1 1 -22 -50" fill="#2A3346" />
          {[[90, 70, 1.7], [220, 140, 1.2], [420, 60, 1.5], [610, 110, 1.1], [760, 50, 1.6], [980, 130, 1.2], [1120, 60, 1.4], [1330, 170, 1.2], [520, 180, 1], [1400, 80, 1.3]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#39445C" className={styles.star} style={{ animationDelay: `${i * 0.7}s` }} />
          ))}

          {/* Distant skyline */}
          <g fill="#0B0F17">
            <rect x="0" y="482" width="1440" height="60" />
            <rect x="60" y="440" width="60" height="60" /><rect x="150" y="456" width="42" height="44" />
            <rect x="270" y="430" width="52" height="70" /><rect x="1140" y="444" width="56" height="56" />
            <rect x="1260" y="426" width="46" height="74" /><rect x="1350" y="452" width="60" height="48" />
          </g>
          <g fill="#22304A" opacity="0.55">
            <rect x="74" y="452" width="6" height="6" /><rect x="92" y="466" width="6" height="6" />
            <rect x="284" y="444" width="6" height="6" /><rect x="300" y="462" width="6" height="6" />
            <rect x="1154" y="456" width="6" height="6" /><rect x="1274" y="440" width="6" height="6" />
          </g>

          {/* Ground, forecourt slab, road */}
          <rect y="540" width="1440" height="90" fill="#0A0D14" />
          <rect x="300" y="540" width="880" height="90" fill="#0E121C" />
          <rect x="300" y="540" width="880" height="3" fill="#1A2130" />
          <rect y="628" width="1440" height="92" fill="url(#st-road)" />
          <rect y="626" width="1440" height="3" fill="#161C29" />
          {[40, 220, 400, 580, 760, 940, 1120, 1300].map(x => (
            <rect key={x} x={x} y="670" width="64" height="5" rx="2.5" fill="#1B2231" />
          ))}

          {/* Canopy glow + light cones */}
          <ellipse ref={refs.glow} cx="740" cy="560" rx="330" ry="130" fill="url(#st-glow)" style={{ opacity: 0 }} />
          <g ref={refs.cones} style={{ opacity: 0 }}>
            <polygon points="512,392 568,392 596,560 484,560" fill="url(#st-cone)" />
            <polygon points="712,392 768,392 796,560 684,560" fill="url(#st-cone)" />
            <polygon points="912,392 968,392 996,560 884,560" fill="url(#st-cone)" />
          </g>

          {/* Canopy */}
          <g>
            <rect x="430" y="336" width="18" height="212" fill="#141926" />
            <rect x="428" y="336" width="5" height="212" fill="#1D2434" />
            <rect x="1032" y="336" width="18" height="212" fill="#141926" />
            <rect x="1030" y="336" width="5" height="212" fill="#1D2434" />
            <rect x="422" y="544" width="34" height="12" rx="3" fill="#161B27" />
            <rect x="1024" y="544" width="34" height="12" rx="3" fill="#161B27" />
            <rect x="380" y="292" width="720" height="48" rx="12" fill="#10141F" stroke="#232838" strokeWidth="2.5" />
            <text ref={refs.brand} x="740" y="324" textAnchor="middle" fontFamily="var(--font-geist-sans), 'Manrope', sans-serif" fontSize="24" fontWeight="800" letterSpacing="7" fill="#37D3A0" style={{ opacity: 0.25, filter: 'drop-shadow(0 0 8px rgba(55,211,160,0.6))' }}>GASIFY</text>
            <rect ref={refs.trim} x="380" y="336" width="720" height="5" rx="2.5" fill="#37D3A0" style={{ opacity: 0.15, filter: 'drop-shadow(0 0 6px rgba(55,211,160,0.8))' }} />
            {[512, 712, 912].map(x => <rect key={x} x={x} y="344" width="56" height="7" rx="3.5" fill="#E9F8F1" opacity="0.9" />)}
          </g>

          {/* Pumps */}
          {[{ x: 560, led: 'pumpLedA', f: 'DIESEL' }, { x: 830, led: 'pumpLedB', f: 'SP95' }].map(pump => (
            <g key={pump.x}>
              <rect x={pump.x - 20} y="586" width="130" height="22" rx="8" fill="#161C29" />
              <rect x={pump.x} y="452" width="90" height="136" rx="10" fill="#1A2030" stroke="#252D40" strokeWidth="2" />
              <rect x={pump.x} y="452" width="90" height="18" rx="9" fill="#212940" />
              <rect x={pump.x + 8} y="478" width="74" height="40" rx="6" fill="#080B11" stroke="#232838" strokeWidth="1.5" />
              <text x={pump.x + 45} y="496" textAnchor="middle" fontFamily="var(--font-geist-sans), sans-serif" fontSize="9" fontWeight="700" letterSpacing="2" fill="#5A6478">{pump.f}</text>
              <text ref={refs[pump.led]} x={pump.x + 45} y="513" textAnchor="middle" fontFamily="DSEG7, Consolas, monospace" fontSize="15" style={{ fill: '#E25A5A' }}>2.09</text>
              <rect x={pump.x + 8} y="528" width="74" height="6" rx="3" fill="#37D3A0" opacity="0.5" />
              <rect x={pump.x + 14} y="544" width="30" height="22" rx="4" fill="#10141F" />
              <path d={`M${pump.x + 90} 486 q26 6 22 34 l-4 22`} fill="none" stroke="#2A3143" strokeWidth="6" strokeLinecap="round" />
              <rect x={pump.x + 100} y="538" width="12" height="24" rx="4" fill="#2A3143" />
            </g>
          ))}

          {/* Price totem — grounded, two fuel rows */}
          <g>
            <rect x="1216" y="380" width="16" height="228" fill="#141926" />
            <rect x="1198" y="600" width="52" height="12" rx="4" fill="#161B27" />
            <rect x="1150" y="196" width="148" height="188" rx="12" fill="#07090D" stroke="#232838" strokeWidth="3" />
            <text x="1224" y="234" textAnchor="middle" fontFamily="var(--font-geist-sans), 'Manrope', sans-serif" fontSize="21" fontWeight="800" letterSpacing="2.5" fill="#EDEFF5">GASIFY</text>
            <rect x="1164" y="248" width="120" height="1.5" fill="#232838" />
            <text x="1172" y="282" fontFamily="var(--font-geist-sans), sans-serif" fontSize="11" fontWeight="700" letterSpacing="1.5" fill="#7A8296">DIESEL</text>
            <text ref={refs.dieselLed} x="1284" y="286" textAnchor="end" fontFamily="DSEG7, Consolas, monospace" fontSize="24" style={{ fill: '#E25A5A' }}>2.09</text>
            <text x="1172" y="330" fontFamily="var(--font-geist-sans), sans-serif" fontSize="11" fontWeight="700" letterSpacing="1.5" fill="#7A8296">SP 95</text>
            <text ref={refs.sp95Led} x="1284" y="334" textAnchor="end" fontFamily="DSEG7, Consolas, monospace" fontSize="24" style={{ fill: '#E25A5A' }}>1.86</text>
            <text x="1224" y="366" textAnchor="middle" fontFamily="var(--font-geist-sans), sans-serif" fontSize="9.5" fontWeight="700" letterSpacing="3" fill="#3C455A">EUR / LITRE</text>
          </g>

          {/* Car — hatchback silhouette, scroll-driven */}
          <g ref={refs.car} transform="translate(-340 0)">
            <ellipse ref={refs.shadow} cx="128" cy="650" rx="122" ry="10" fill="#000" style={{ opacity: 0.5 }} />
            <polygon ref={refs.beam} points="244,602 408,584 408,640 244,632" fill="url(#st-beam)" style={{ opacity: 0 }} />
            <path d="M14 640 q-8 -2 -8 -12 q0 -22 20 -26 l20 -4 q10 -22 32 -34 q14 -8 34 -8 l52 0 q20 0 34 10 q16 11 24 26 l26 6 q22 5 22 26 q0 14 -10 16 z" fill="#151A26" stroke="#262E42" strokeWidth="2.5" />
            <path d="M74 594 q8 -22 28 -30 l10 -4 0 34 z" fill="url(#st-glass)" opacity="0.9" />
            <path d="M120 560 l40 0 q16 0 28 10 q10 8 14 22 l-82 2 z" fill="url(#st-glass)" opacity="0.9" />
            <rect x="8" y="612" width="12" height="7" rx="3.5" fill="#E25A5A" opacity="0.95" />
            <ellipse ref={refs.brake} cx="14" cy="615" rx="26" ry="14" fill="url(#st-brake)" style={{ opacity: 0 }} />
            <rect x="238" y="606" width="12" height="7" rx="3.5" fill="#F2ECCF" opacity="0.95" />
            <g ref={refs.wheelA}>
              <circle cx="60" cy="636" r="17" fill="#0A0D13" stroke="#2E374C" strokeWidth="4" />
              <line x1="60" y1="624" x2="60" y2="648" stroke="#2E374C" strokeWidth="2.5" />
              <line x1="48" y1="636" x2="72" y2="636" stroke="#2E374C" strokeWidth="2.5" />
            </g>
            <g ref={refs.wheelB}>
              <circle cx="196" cy="636" r="17" fill="#0A0D13" stroke="#2E374C" strokeWidth="4" />
              <line x1="196" y1="624" x2="196" y2="648" stroke="#2E374C" strokeWidth="2.5" />
              <line x1="184" y1="636" x2="208" y2="636" stroke="#2E374C" strokeWidth="2.5" />
            </g>
            {/* Tank gauge floating above the roof */}
            <g transform="translate(128 528)">
              <path d="M-20 8 a20 20 0 1 1 40 0" fill="none" stroke="#232838" strokeWidth="5" strokeLinecap="round" />
              <path ref={refs.gauge} d="M20 8 a20 20 0 1 0 -40 0" fill="none" stroke="#37D3A0" strokeWidth="5" strokeLinecap="round"
                strokeDasharray="126" style={{ strokeDashoffset: 126, filter: 'drop-shadow(0 0 4px rgba(55,211,160,0.7))' }} />
            </g>
          </g>
        </svg>

        <div ref={copyRefs[0]} className={styles.copy} style={{ opacity: 0 }}>
          <p className={styles.kicker}>The same litre of diesel</p>
          <h2 className={styles.line}>€2.09 at one station.<br />€1.52 at another.</h2>
        </div>
        <div ref={copyRefs[1]} className={styles.copy} style={{ opacity: 0 }}>
          <p className={styles.kicker}>Live prices, official sources</p>
          <h2 className={styles.line}>Gasify finds the one<br />worth driving to.</h2>
        </div>
        <div ref={copyRefs[2]} className={styles.copy} style={{ opacity: 0 }}>
          <p className={styles.kicker}>On a 50-litre tank, that&apos;s</p>
          <h2 className={styles.line}><span ref={refs.saved} className={styles.saved}>€0.00</span> back in your pocket.</h2>
          <p className={styles.sub}>Keep scrolling — every station is on the map.</p>
        </div>
      </div>
    </section>
  );
}
