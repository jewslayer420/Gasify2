'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import styles from './ScrollStation.module.css';

// Scroll-scrubbed night forecourt (Apple-style pinned stage). Scroll progress
// powers the station on, drives the car in, and rolls the LED sign from an
// expensive red price down to a cheap green one. All motion is imperative
// (refs + rAF) so scrolling never re-renders React. Reduced motion / no-JS
// gets the fully assembled final scene.
//
// Price story: real diesel medians (Germany €2.02 vs Czechia €1.52 rounded up
// for the sign's opening beat) — refresh occasionally alongside the league.
const PRICE_HIGH = 2.09;
const PRICE_LOW = 1.52;
const TANK_L = 50;

const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => t * t * (3 - 2 * t); // smoothstep
const seg = (p, a, b) => clamp01((p - a) / (b - a));

function ledColor(price) {
  if (price <= 1.60) return '#37D3A0';
  if (price <= 1.90) return '#E8A23D';
  return '#E25A5A';
}

export default function ScrollStation() {
  const wrapRef = useRef(null);
  const carRef = useRef(null);
  const wheelARef = useRef(null);
  const wheelBRef = useRef(null);
  const glowRef = useRef(null);
  const trimRef = useRef(null);
  const priceRef = useRef(null);
  const beamRef = useRef(null);
  const gaugeRef = useRef(null);
  const savedRef = useRef(null);
  const copyRefs = [useRef(null), useRef(null), useRef(null)];

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;

    function render(p) {
      // Station power-up
      const power = ease(seg(p, 0.04, 0.28));
      if (glowRef.current) glowRef.current.style.opacity = power * 0.85;
      if (trimRef.current) trimRef.current.style.opacity = 0.25 + power * 0.75;

      // Car drives in and stops at the pump
      const drive = ease(seg(p, 0.14, 0.54));
      const carX = -300 + drive * 586; // stops with the car between the two pumps
      if (carRef.current) carRef.current.setAttribute('transform', `translate(${carX} 0)`);
      const spin = (carX + 300) / 0.42; // wheel r=15 → deg ≈ px/0.26; softened for taste
      if (wheelARef.current) wheelARef.current.setAttribute('transform', `rotate(${spin} 318 556)`);
      if (wheelBRef.current) wheelBRef.current.setAttribute('transform', `rotate(${spin} 424 556)`);
      if (beamRef.current) beamRef.current.style.opacity = drive > 0.02 && drive < 0.98 ? 0.5 : 0;

      // LED price rolls down as the car arrives
      const roll = ease(seg(p, 0.4, 0.68));
      const price = PRICE_HIGH + (PRICE_LOW - PRICE_HIGH) * roll;
      if (priceRef.current) {
        priceRef.current.textContent = price.toFixed(2);
        const c = ledColor(price);
        priceRef.current.style.fill = c;
        priceRef.current.style.filter = `drop-shadow(0 0 6px ${c})`;
      }

      // Tank gauge + savings counter
      const fill = ease(seg(p, 0.66, 0.9));
      if (gaugeRef.current) gaugeRef.current.style.strokeDashoffset = 132 * (1 - fill);
      if (savedRef.current) {
        savedRef.current.textContent = `€${((PRICE_HIGH - PRICE_LOW) * TANK_L * fill).toFixed(2)}`;
      }

      // Copy beats
      const windows = [[0, 0.06, 0.24, 0.34], [0.3, 0.4, 0.58, 0.68], [0.64, 0.76, 1, 1.01]];
      copyRefs.forEach((ref, i) => {
        if (!ref.current) return;
        const [a, b, c, d] = windows[i];
        const vis = p < a ? 0 : p < b ? seg(p, a, b) : p < c ? 1 : 1 - seg(p, c, d);
        ref.current.style.opacity = vis;
        ref.current.style.transform = `translateY(${(1 - vis) * 18}px)`;
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
        const scrollable = el.offsetHeight - window.innerHeight;
        render(clamp01(-rect.top / Math.max(1, scrollable)));
      });
    }
    onScroll();
    // globals.css gives html/body height:100%, so the BODY is the scroll
    // container and window never fires 'scroll'. Scroll events don't bubble,
    // but capture on document catches them from any scroller; the rect-based
    // progress math is container-agnostic.
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
        <svg className={styles.scene} viewBox="0 0 1200 640" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <defs>
            <linearGradient id="ss-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#05070B" />
              <stop offset="1" stopColor="#0A0D14" />
            </linearGradient>
            <radialGradient id="ss-glow" cx="0.5" cy="0" r="1">
              <stop offset="0" stopColor="#37D3A0" stopOpacity="0.35" />
              <stop offset="0.55" stopColor="#37D3A0" stopOpacity="0.08" />
              <stop offset="1" stopColor="#37D3A0" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ss-beam" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#F5F0D8" stopOpacity="0.4" />
              <stop offset="1" stopColor="#F5F0D8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Night */}
          <rect width="1200" height="640" fill="url(#ss-sky)" />
          <circle cx="1050" cy="80" r="2" fill="#3A4358" /><circle cx="140" cy="60" r="1.6" fill="#3A4358" />
          <circle cx="330" cy="110" r="1.4" fill="#333C50" /><circle cx="880" cy="50" r="1.7" fill="#333C50" />
          <circle cx="640" cy="90" r="1.3" fill="#2C3446" /><circle cx="990" cy="150" r="1.4" fill="#2C3446" />

          {/* Ground + road */}
          <rect y="580" width="1200" height="60" fill="#0A0D13" />
          <rect y="576" width="1200" height="4" fill="#141926" />
          <rect x="40" y="606" width="46" height="4" rx="2" fill="#1E2534" />
          <rect x="160" y="606" width="46" height="4" rx="2" fill="#1E2534" />
          <rect x="280" y="606" width="46" height="4" rx="2" fill="#1E2534" />

          {/* Canopy underglow (powers on) */}
          <ellipse ref={glowRef} cx="600" cy="480" rx="290" ry="150" fill="url(#ss-glow)" style={{ opacity: 0 }} />

          {/* Canopy */}
          <rect x="378" y="188" width="444" height="34" rx="8" fill="#10131B" stroke="#232838" strokeWidth="2" />
          <rect ref={trimRef} x="378" y="216" width="444" height="5" rx="2.5" fill="#37D3A0" style={{ opacity: 0.25 }} />
          <rect x="410" y="222" width="10" height="358" fill="#161B27" />
          <rect x="780" y="222" width="10" height="358" fill="#161B27" />

          {/* Pump island */}
          <rect x="470" y="560" width="260" height="20" rx="6" fill="#141926" />
          <g>
            <rect x="512" y="470" width="66" height="92" rx="8" fill="#1A2030" stroke="#232838" strokeWidth="2" />
            <rect x="524" y="484" width="42" height="26" rx="4" fill="#0B0E15" />
            <text x="545" y="503" textAnchor="middle" fontFamily="DSEG7, Consolas, monospace" fontSize="14" fill="#37D3A0" opacity="0.9">88.8</text>
            <rect x="524" y="518" width="42" height="8" rx="3" fill="#232838" />
            <rect x="571" y="492" width="7" height="40" rx="3" fill="#2A3143" />
          </g>
          <g>
            <rect x="626" y="470" width="66" height="92" rx="8" fill="#1A2030" stroke="#232838" strokeWidth="2" />
            <rect x="638" y="484" width="42" height="26" rx="4" fill="#0B0E15" />
            <text x="659" y="503" textAnchor="middle" fontFamily="DSEG7, Consolas, monospace" fontSize="14" fill="#37D3A0" opacity="0.9">88.8</text>
            <rect x="638" y="518" width="42" height="8" rx="3" fill="#232838" />
            <rect x="685" y="492" width="7" height="40" rx="3" fill="#2A3143" />
          </g>

          {/* Price totem — the sign the whole site is built around */}
          <g>
            <rect x="964" y="286" width="14" height="294" fill="#161B27" />
            <rect x="906" y="180" width="130" height="118" rx="10" fill="#07090D" stroke="#232838" strokeWidth="3" />
            <text x="971" y="212" textAnchor="middle" fontFamily="var(--font-geist-sans), system-ui, sans-serif" fontSize="19" fontWeight="800" letterSpacing="2" fill="#EDEFF5">GASIFY</text>
            <rect x="918" y="224" width="106" height="1.5" fill="#232838" />
            <text x="971" y="245" textAnchor="middle" fontFamily="var(--font-geist-sans), system-ui, sans-serif" fontSize="10.5" fontWeight="700" letterSpacing="3" fill="#7A8296">DIESEL</text>
            <text ref={priceRef} x="971" y="283" textAnchor="middle" fontFamily="DSEG7, Consolas, monospace" fontSize="30" style={{ fill: '#E25A5A', filter: 'drop-shadow(0 0 6px #E25A5A)' }}>2.09</text>
          </g>

          {/* Car (driven by scroll) */}
          <g ref={carRef} transform="translate(-300 0)">
            <rect ref={beamRef} x="446" y="522" width="150" height="26" fill="url(#ss-beam)" style={{ opacity: 0 }} />
            <path d="M282 556 q0 -26 26 -28 l18 -20 q6 -7 16 -7 l58 0 q10 0 16 7 l18 20 26 0 q22 0 22 22 l0 6 q0 8 -8 8 l-184 0 q-8 0 -8 -8 z" fill="#141720" stroke="#232838" strokeWidth="2" />
            <path d="M330 528 l14 -16 q3 -4 9 -4 l40 0 q6 0 9 4 l14 16 z" fill="#0B0E15" stroke="#232838" strokeWidth="1.5" />
            <rect x="288" y="540" width="10" height="5" rx="2.5" fill="#E25A5A" opacity="0.9" />
            <rect x="446" y="540" width="10" height="5" rx="2.5" fill="#F5F0D8" opacity="0.9" />
            <g ref={wheelARef}>
              <circle cx="318" cy="556" r="15" fill="#0B0E15" stroke="#2A3143" strokeWidth="3" />
              <line x1="318" y1="545" x2="318" y2="567" stroke="#2A3143" strokeWidth="2.5" />
            </g>
            <g ref={wheelBRef}>
              <circle cx="424" cy="556" r="15" fill="#0B0E15" stroke="#2A3143" strokeWidth="3" />
              <line x1="424" y1="545" x2="424" y2="567" stroke="#2A3143" strokeWidth="2.5" />
            </g>
            {/* Tank gauge above the car */}
            <g transform="translate(371 470)">
              <path d="M-21 10 a21 21 0 1 1 42 0" fill="none" stroke="#232838" strokeWidth="5" strokeLinecap="round" />
              <path ref={gaugeRef} d="M-21 10 a21 21 0 1 1 42 0" fill="none" stroke="#37D3A0" strokeWidth="5" strokeLinecap="round"
                strokeDasharray="132" style={{ strokeDashoffset: 132 }} transform="scale(-1 1)" />
            </g>
          </g>
        </svg>

        {/* Copy beats */}
        <div ref={copyRefs[0]} className={styles.copy} style={{ opacity: 0 }}>
          <p className={styles.kicker}>The same litre of diesel</p>
          <h2 className={styles.line}>costs €2.09 at one station.<br />€1.52 at another.</h2>
        </div>
        <div ref={copyRefs[1]} className={styles.copy} style={{ opacity: 0 }}>
          <p className={styles.kicker}>Live prices, official sources</p>
          <h2 className={styles.line}>Gasify finds the one<br />worth driving to.</h2>
        </div>
        <div ref={copyRefs[2]} className={styles.copy} style={{ opacity: 0 }}>
          <p className={styles.kicker}>On a 50-litre tank, that's</p>
          <h2 className={styles.line}><span ref={savedRef} className={styles.saved}>€0.00</span> back in your pocket.</h2>
          <Link href="/map" className={styles.cta}>Open the map</Link>
        </div>
      </div>
    </section>
  );
}
