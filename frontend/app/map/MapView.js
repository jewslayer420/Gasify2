'use client';
import Link from 'next/link';
import { useState, useEffect, useRef, useMemo } from 'react';
import Map, { Marker, AttributionControl, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getStationsGeoJSON, getStation, getStationHistory, geocodeCity, addFavorite, removeFavorite, getFavorites, getCountryCounts, getCountryMeta } from '../../lib/api';
import { COUNTRY_NAMES } from '../../lib/countries';
import { COUNTRY_CENTROIDS } from '../../lib/countryCentroids';
import { useUser } from '../../lib/context/UserContext';
import { useCurrency } from '../../lib/context/CurrencyContext';
import CurrencySelect from '../../components/CurrencySelect/CurrencySelect';
import styles from './map.module.css';

// MapTiler (commercial-licensed) when a key is configured; CARTO's free styles as a
// dev-only fallback (non-commercial — do not ship without the key). Switching a
// MapLibre style wipes custom sources/layers, so handleMapLoad re-adds them on
// every style.load using the cached GeoJSON (no re-download).
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const MAP_STYLES = MAPTILER_KEY
  ? {
      dark:      { label: 'Dark',      url: `https://api.maptiler.com/maps/basic-v2-dark/style.json?key=${MAPTILER_KEY}` },
      light:     { label: 'Light',     url: `https://api.maptiler.com/maps/basic-v2/style.json?key=${MAPTILER_KEY}` },
      streets:   { label: 'Streets',   url: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}` },
      satellite: { label: 'Satellite', url: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}` },
    }
  : {
      dark:  { label: 'Dark',  url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
      light: { label: 'Light', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
    };
const STYLE_LS_KEY = 'gasify_map_style';

const FUELS = [
  { key: 'diesel',         label: 'Diesel' },
  { key: 'diesel_premium', label: 'Premium Diesel' },
  { key: 'sp95',           label: 'Unleaded 95' },
  { key: 'sp98',           label: 'Unleaded 98' },
  { key: 'sp100',          label: 'Super 100' },
  { key: 'e10',            label: 'E10' },
  { key: 'lpg',            label: 'LPG' },
  { key: 'cng',            label: 'CNG' },
];

const FLAGS = { SI: '🇸🇮', FR: '🇫🇷', AT: '🇦🇹', HU: '🇭🇺', DE: '🇩🇪', CZ: '🇨🇿', SK: '🇸🇰', NL: '🇳🇱', BE: '🇧🇪', CH: '🇨🇭', PL: '🇵🇱', RO: '🇷🇴', HR: '🇭🇷', RS: '🇷🇸', ES: '🇪🇸', IT: '🇮🇹', PT: '🇵🇹', LU: '🇱🇺', LI: '🇱🇮', AD: '🇦🇩', MC: '🇲🇨', BG: '🇧🇬', GR: '🇬🇷', CY: '🇨🇾', MT: '🇲🇹', BA: '🇧🇦', ME: '🇲🇪', MK: '🇲🇰', AL: '🇦🇱', XK: '🇽🇰', GB: '🇬🇧', DK: '🇩🇰', FI: '🇫🇮', IE: '🇮🇪', LV: '🇱🇻', LT: '🇱🇹', EE: '🇪🇪', TR: '🇹🇷', AU: '🇦🇺', IS: '🇮🇸', MX: '🇲🇽', TW: '🇹🇼', MY: '🇲🇾', TH: '🇹🇭', NZ: '🇳🇿', CA: '🇨🇦', CL: '🇨🇱', BR: '🇧🇷', US: '🇺🇸', ZA: '🇿🇦', AE: '🇦🇪', SA: '🇸🇦', KE: '🇰🇪', DO: '🇩🇴', UY: '🇺🇾', QA: '🇶🇦', KW: '🇰🇼', OM: '🇴🇲', BH: '🇧🇭', BN: '🇧🇳', EC: '🇪🇨', VN: '🇻🇳', EG: '🇪🇬', JO: '🇯🇴', TN: '🇹🇳', MA: '🇲🇦', ID: '🇮🇩', IN: '🇮🇳', MD: '🇲🇩', IL: '🇮🇱', PK: '🇵🇰', JP: '🇯🇵', BD: '🇧🇩', LK: '🇱🇰', NP: '🇳🇵', CR: '🇨🇷', PA: '🇵🇦', AZ: '🇦🇿', DZ: '🇩🇿' };
const COUNTRY_LABEL = { GB: 'UK' };

// Compact relative age for the detail card honesty line
function relAgo(iso) {
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (!isFinite(h) || h < 0) return null;
  if (h < 1) return 'less than an hour ago';
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function priceColor(p) {
  if (!p) return '#5A6072';
  if (p <= 1.60) return '#2FBF84';
  if (p <= 1.90) return '#E8A23D';
  return '#E25A5A';
}

// Bare digits for the LED totem (no symbol, no grouping — like a real sign).
// Decimals scale with magnitude so IDR reads 17300, EUR reads 1.853.
function ledDigits(v) {
  if (v == null) return '-.---';
  if (v >= 1000) return String(Math.round(v));
  if (v >= 100) return v.toFixed(1);
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

// Per-basemap data-layer palettes. The dark palette's pastels wash out on
// light backgrounds and satellite imagery, so Light/Streets get deeper
// saturated tones and Satellite gets vivid hot colours.
const LAYER_THEMES = {
  dark: {
    ramp: ['rgba(47,191,132,0.5)', 'rgba(232,162,61,0.7)', 'rgba(226,90,90,0.85)', 'rgba(226,90,90,0.95)'],
    dot: { green: '#2FBF84', amber: '#E8A23D', red: '#E25A5A', none: '#5A6072', stroke: 'rgba(255,255,255,0.25)' },
  },
  light: {
    ramp: ['rgba(16,122,73,0.55)', 'rgba(202,102,0,0.8)', 'rgba(185,28,28,0.88)', 'rgba(140,16,16,0.95)'],
    dot: { green: '#118A56', amber: '#C2650A', red: '#B91C1C', none: '#6B7280', stroke: 'rgba(0,0,0,0.3)' },
  },
  satellite: {
    ramp: ['rgba(0,230,118,0.55)', 'rgba(255,193,7,0.8)', 'rgba(255,61,0,0.92)', 'rgba(255,23,0,0.97)'],
    dot: { green: '#00E676', amber: '#FFC107', red: '#FF3D00', none: '#B0BEC5', stroke: 'rgba(255,255,255,0.6)' },
  },
};
const THEME_FOR_STYLE = { dark: 'dark', light: 'light', streets: 'light', satellite: 'satellite' };

// Heatmap — GPU-rendered density view at mid zoom
function makeHeatmapLayer(styleKey) {
  const t = LAYER_THEMES[THEME_FOR_STYLE[styleKey] ?? 'dark'];
  return {
    id: 'stations-heat',
    type: 'heatmap',
    source: 'stations',
    minzoom: 0,
    maxzoom: 13,
    paint: {
      'heatmap-weight': 1,
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.011, 5, 0.03, 8, 0.1, 11, 0.3, 13, 0.5],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 6, 8, 9, 14, 12, 28],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0,    'rgba(0,0,0,0)',
        0.2,  t.ramp[0],
        0.5,  t.ramp[1],
        0.8,  t.ramp[2],
        1,    t.ramp[3],
      ],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 12.5, 0],
    },
  };
}

// Individual station dot — fades in as heatmap fades out
function makePointLayer(styleKey) {
  const t = LAYER_THEMES[THEME_FOR_STYLE[styleKey] ?? 'dark'];
  return {
    id: 'points',
    type: 'circle',
    source: 'stations',
    minzoom: 10,
    paint: {
      'circle-color': [
        'case',
        ['<', ['get', 'price'], 0], t.dot.none,
        ['<', ['get', 'price'], 1.60], t.dot.green,
        ['<', ['get', 'price'], 1.90], t.dot.amber,
        t.dot.red,
      ],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 12, 6, 15, 10],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': t.dot.stroke,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0, 12.5, 0.9],
    },
  };
}

// Badge-eligible countries = everything with a centroid. Derived (not a separate
// hand-maintained list) so newly added countries can't silently miss a badge —
// countryTotals still gates rendering to countries that actually have stations.
const COUNTRIES = Object.keys(COUNTRY_CENTROIDS);

const COUNTRY_SCALE = { ES: 1.2, IT: 1.15, FR: 1.25, DE: 1.2, PL: 1.1, RO: 1.0, AT: 1.0, HU: 1.0, PT: 0.9, CZ: 0.95, NL: 0.85, SK: 0.8, BE: 0.8, CH: 0.75, HR: 0.75, SI: 0.65, RS: 0.7, LU: 0.5, LI: 0.35, AD: 0.35, MC: 0.3, BG: 0.8, GR: 1.0, CY: 0.5, MT: 0.35, BA: 0.75, ME: 0.5, MK: 0.55, AL: 0.55, XK: 0.4, GB: 1.2, DK: 0.8, FI: 1.1, IE: 0.75, LV: 0.75, LT: 0.75, EE: 0.65, TR: 1.4, AU: 1.8, IS: 0.7, MX: 1.4, TW: 0.6, MY: 1.1, TH: 1.1, NZ: 1.0, CA: 1.9, CL: 0.85, BR: 1.9, US: 2.2, ZA: 1.2, AE: 0.6, SA: 1.4, KE: 1.0, DO: 0.55, UY: 0.7, QA: 0.45, KW: 0.5, OM: 1.0, BH: 0.35, BN: 0.45, EC: 0.9, VN: 1.1, EG: 1.2, JO: 0.6, TN: 0.7, MA: 1.0, ID: 1.8, IN: 2.0, MD: 0.55, IL: 0.6, PK: 1.3, JP: 1.3, BD: 0.8, LK: 0.6, NP: 0.6, CR: 0.55, PA: 0.55, AZ: 0.65, DZ: 1.2 };

// Country pills: approximate on-screen footprint used for collision decluttering
// (same approach as the home MapPreview — keep the highest-coverage pill in each
// contested spot; zooming in spreads countries apart and reveals the rest).
const PILL_W = 92;
const PILL_H = 36;

// Web-mercator screen position at a given zoom (world px, tile size 512)
function project(lng, lat, zoom) {
  const scale = 512 * Math.pow(2, zoom);
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  };
}

export default function MapView() {
  const { user } = useUser() ?? {};
  const { fmt, fmtCompact, convert, effCode } = useCurrency();
  const [fuel, setFuel] = useState('diesel');
  const [sidebarStations, setSidebarStations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [userPos, setUserPos] = useState(null);
  const [winner, setWinner] = useState(null);   // cheapest-near-me highlighted station
  const [countryMeta, setCountryMeta] = useState([]); // league/lens data per fuel
  const [mapCenter, setMapCenter] = useState({ lng: 15, lat: 50 });
  const [favStations, setFavStations] = useState([]);   // full saved-station objects
  const [panelTab, setPanelTab] = useState('list');      // 'list' | 'saved'
  const [ctaBusy, setCtaBusy] = useState(false);
  const [ctaMsg, setCtaMsg] = useState(null);
  const [citySearch, setCitySearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('bbox');
  const [baseStyle, setBaseStyle] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = localStorage.getItem(STYLE_LS_KEY);
    return MAP_STYLES[saved] ? saved : 'dark';
  });
  const [stationsGeojson, setStationsGeojson] = useState(null);
  const [showCountryBadges, setShowCountryBadges] = useState(true);
  const [mapZoom, setMapZoom] = useState(4.3); // must match initialViewState.zoom — onMove only fires on interaction
  const [countryTotals, setCountryTotals] = useState({});
  const [countryFocus, setCountryFocus] = useState(null); // cc: league/pill click scopes the sidebar to one country

  const mapRef = useRef(null);
  const allStations = useRef([]);   // full in-memory station list for current fuel
  const mapLoaded = useRef(false);
  const modeRef = useRef('bbox');
  const fuelRef = useRef(fuel);
  const focusRef = useRef(null);    // mirrors countryFocus for map callbacks
  const prevZoomBelow7 = useRef(true);
  fuelRef.current = fuel;
  modeRef.current = mode;


  useEffect(() => {
    if (user) getFavorites().then(favs => {
      setFavorites(new Set(favs.map(f => f.id)));
      setFavStations(favs);
    });
  }, [user]);

  // Country badge totals — fuel-agnostic: a badge shows for every country with
  // any stations, regardless of selected fuel (e.g. Canada has only gasoline).
  // Loaded once from /counts; not tied to the per-fuel station list.
  useEffect(() => {
    getCountryCounts().then(setCountryTotals).catch(() => {});
  }, []);

  // League/lens data refreshes when the fuel changes (backend caches 10 min)
  useEffect(() => {
    getCountryMeta(fuel).then(setCountryMeta).catch(() => {});
  }, [fuel]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      pos => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      null,
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Filter allStations by current map viewport and update the sidebar.
  // O(n) array scan — runs only on moveEnd, not every frame.
  // With a country focus set, the list is that country's cheapest stations
  // nationwide instead of the viewport's (a viewport at country zoom leaks
  // cheaper neighbours to the top — clicking Italy showed Bosnian stations).
  function updateSidebar() {
    if (modeRef.current !== 'bbox') return;
    if (!allStations.current.length) return;
    if (focusRef.current) {
      const cc = focusRef.current;
      setSidebarStations(
        allStations.current
          .filter(s => s.country === cc)
          .sort((a, b) => (a.price ?? 9) - (b.price ?? 9))
          .slice(0, 100)
      );
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = map.getBounds();
    const [sv, w, n, e] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    const visible = allStations.current
      .filter(s => s.lat >= sv && s.lat <= n && s.lng >= w && s.lng <= e)
      .sort((a, b) => (a.price ?? 9) - (b.price ?? 9))
      .slice(0, 100);
    setSidebarStations(visible);
  }

  // Enter/leave country focus (league row or map pill click). Zooming back out
  // to the badge view clears it, restoring the all-countries league.
  function applyFocus(cc) {
    focusRef.current = cc;
    setCountryFocus(cc);
    updateSidebar();
  }

  function focusCountry(cc) {
    const c = COUNTRY_CENTROIDS[cc];
    if (!c) return;
    applyFocus(cc);
    mapRef.current?.flyTo({ center: [c.lng, c.lat], zoom: 6.6, duration: 1200 });
  }

  // Load all stations for a fuel type: one request, cached 30 min by the browser.
  // The GeoJSON lives in React state and renders via declarative <Source>/<Layer>,
  // which react-map-gl re-attaches automatically after basemap style switches.
  async function loadStations(fuelType) {
    setLoading(true);
    try {
      const geojson = await getStationsGeoJSON(fuelType);
      setStationsGeojson(geojson);
      allStations.current = geojson.features.map(f => ({
        id: f.properties.id,
        name: f.properties.name,
        city: f.properties.city,
        country: f.properties.country,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        price: f.properties.price < 0 ? null : f.properties.price,
        distance: null,
        allPrices: {},
      }));
      updateSidebar();
    } catch {}
    setLoading(false);
  }

  // Re-fetch when fuel changes; also refresh history for the open station.
  const prevFuel = useRef(fuel);
  useEffect(() => {
    if (prevFuel.current === fuel) return;
    prevFuel.current = fuel;
    if (mapLoaded.current) loadStations(fuel);
    if (selected) {
      setHistory([]);
      setLoadingHistory(true);
      getStationHistory(selected.id, fuel)
        .then(h => setHistory(h.map(r => ({
          date: new Date(r.recordedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
          price: r.price,
        }))))
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
  }, [fuel]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMapLoad(e) {
    if (typeof window !== 'undefined') window.__gasifyMap = e.target; // debug/tuning hook
    mapLoaded.current = true;
    loadStations(fuelRef.current);
  }

  function switchBaseStyle(key) {
    if (!MAP_STYLES[key] || key === baseStyle) return;
    setBaseStyle(key);
    try { localStorage.setItem(STYLE_LS_KEY, key); } catch {}
  }

  // After every pan/zoom-end: update sidebar from in-memory data — no network.
  function handleMoveEnd(e) {
    updateSidebar();
    if (e?.viewState?.zoom != null) setMapZoom(e.viewState.zoom);
  }

  function handleMapClick(e) {
    if (!e.features?.length) return;
    const feature = e.features[0];
    if (feature.layer.id !== 'points') return;
    const p = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    handleSelectStation({
      id: p.id, name: p.name, city: p.city, country: p.country,
      lat, lng,
      price: p.price < 0 ? null : p.price,
      distance: null,
      allPrices: {},
    });
  }

  // Near-me: sort all in-memory stations by distance — no network request.
  function handleNearMe() {
    if (!userPos) return;
    focusRef.current = null;
    setCountryFocus(null);
    setMode('near');
    modeRef.current = 'near';
    mapRef.current?.flyTo({ center: [userPos.lng, userPos.lat], zoom: 13, duration: 800 });
    const { lat, lng } = userPos;
    const near = allStations.current
      .map(s => {
        const dx = (s.lat - lat) * 111.32;
        const dy = (s.lng - lng) * 111.32 * Math.cos(lat * Math.PI / 180);
        return { ...s, distance: Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10 };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 50);
    setSidebarStations(near);
  }

  // One-click value prop: locate → rank nearby by price → crown the winner.
  function cheapestNearMe() {
    setCtaMsg(null);
    const run = pos => {
      focusRef.current = null;
      setCountryFocus(null);
      setMode('near');
      modeRef.current = 'near';
      const { lat, lng } = pos;
      const near = allStations.current
        .map(s => {
          const dx = (s.lat - lat) * 111.32;
          const dy = (s.lng - lng) * 111.32 * Math.cos(lat * Math.PI / 180);
          return { ...s, distance: Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10 };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 50);
      setSidebarStations(near);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 12.5, duration: 900 });
      const cheapest = near.slice(0, 25).filter(s => s.price)
        .sort((a, b) => a.price - b.price)[0];
      if (cheapest) {
        setWinner(cheapest);
        handleSelectStation(cheapest);
      } else {
        setCtaMsg('No priced stations found nearby');
      }
      setCtaBusy(false);
    };
    if (userPos) { run(userPos); return; }
    setCtaBusy(true);
    navigator.geolocation.getCurrentPosition(
      p => { const pos = { lat: p.coords.latitude, lng: p.coords.longitude }; setUserPos(pos); run(pos); },
      () => { setCtaBusy(false); setCtaMsg('Location denied — allow location access to find the cheapest station near you'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleBboxMode() {
    focusRef.current = null;
    setCountryFocus(null);
    setMode('bbox');
    modeRef.current = 'bbox';
    updateSidebar();
  }

  async function handleCitySearch(e) {
    e.preventDefault();
    if (!citySearch.trim()) return;
    setLoading(true);
    focusRef.current = null;
    setCountryFocus(null);
    setMode('bbox');
    modeRef.current = 'bbox';
    try {
      const geo = await geocodeCity(citySearch.trim());
      if (geo) {
        let zoom = 13;
        if (geo.boundingBox) {
          const span = Math.abs(geo.boundingBox[1] - geo.boundingBox[0]);
          if (span > 0.3) zoom = 11;
          else if (span > 0.1) zoom = 12;
        }
        mapRef.current?.flyTo({ center: [geo.lng, geo.lat], zoom, duration: 900 });
        // onMoveEnd fires after fly completes and updates sidebar
      }
    } catch {}
    setLoading(false);
  }

  async function handleSelectStation(station) {
    setSelected(station);
    setHistory([]);
    setLoadingHistory(true);
    try {
      // Fetch history + full station detail (allPrices) in parallel
      const [h, detail] = await Promise.all([
        getStationHistory(station.id, fuelRef.current),
        getStation(station.id),
      ]);
      setSelected(s => s?.id === station.id ? { ...s, allPrices: detail.allPrices ?? {} } : s);
      setHistory(h.map(r => ({
        date: new Date(r.recordedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        price: r.price,
      })));
    } catch {}
    setLoadingHistory(false);
  }

  async function toggleFavorite(stationId) {
    if (!user) return;
    if (favorites.has(stationId)) {
      await removeFavorite(stationId);
      setFavorites(s => { const n = new Set(s); n.delete(stationId); return n; });
      setFavStations(list => list.filter(s => s.id !== stationId));
    } else {
      await addFavorite(stationId);
      setFavorites(s => new Set([...s, stationId]));
      if (selected?.id === stationId) setFavStations(list => [selected, ...list]);
    }
  }

  const dragStartY = useRef(null);
  const [sheetHeight, setSheetHeight] = useState(120);
  function onTouchStart(e) { dragStartY.current = e.touches[0].clientY; }
  function onTouchMove(e) {
    if (dragStartY.current === null) return;
    const dy = dragStartY.current - e.touches[0].clientY;
    setSheetHeight(h => Math.max(120, Math.min(window.innerHeight * 0.85, h + dy)));
    dragStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd() { dragStartY.current = null; }

  // Fall back to station.price (loaded with initial GeoJSON) until allPrices arrives from getStation
  const selectedPrice = selected ? (selected.allPrices?.[fuel] ?? selected.price ?? null) : null;

  // Country price pills (zoomed out): the selected fuel's national median as a
  // mini price sign. Priced pills win contested space over unpriced ones, then
  // bigger networks over smaller; collision-decluttered per zoom level.
  const badgePills = useMemo(() => {
    if (!showCountryBadges) return [];
    const medians = {};
    for (const m of countryMeta) medians[m.country] = m.median;
    const list = COUNTRIES
      .filter(c => countryTotals[c])
      .map(c => ({
        country: c,
        median: medians[c] ?? null,
        big: (COUNTRY_SCALE[c] ?? 1) >= 1.1,
        ...COUNTRY_CENTROIDS[c],
      }))
      .sort((a, b) =>
        (b.median != null) - (a.median != null) ||
        (countryTotals[b.country] ?? 0) - (countryTotals[a.country] ?? 0)
      );
    const placed = [];
    const out = [];
    for (const c of list) {
      const p = project(c.lng, c.lat, mapZoom);
      if (placed.some(q => Math.abs(q.x - p.x) < PILL_W && Math.abs(q.y - p.y) < PILL_H)) continue;
      placed.push(p);
      out.push(c);
    }
    return out;
  }, [showCountryBadges, countryMeta, countryTotals, mapZoom]);

  // Country lens: the focused country when set, otherwise the country whose
  // centroid is nearest the map centre. (Deriving it from visible stations
  // biased toward the cheapest neighbour, since the list is price-sorted.)
  let lens = null;
  if (!showCountryBadges && countryFocus) {
    lens = countryMeta.find(m => m.country === countryFocus) ?? null;
  } else if (!showCountryBadges && countryMeta.length) {
    let bestD = Infinity;
    for (const m of countryMeta) {
      const c = COUNTRY_CENTROIDS[m.country];
      if (!c) continue;
      const dx = c.lat - mapCenter.lat;
      const dy = (c.lng - mapCenter.lng) * Math.cos(mapCenter.lat * Math.PI / 180);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; lens = m; }
    }
  }
  const lensFuels = lens?.fuels ?? null;

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <Link href="/" className={styles.homeChip}>Gasify<span className={styles.homeChipDot}>.</span></Link>
        <div className={styles.commandBar}>
          <form onSubmit={handleCitySearch} className={styles.searchForm}>
            <input className={styles.searchInput} placeholder="Search city…" value={citySearch} onChange={e => setCitySearch(e.target.value)} />
            <button className={styles.searchBtn} type="submit">Go</button>
          </form>
          <div className={styles.fuelTabs}>
            {FUELS.map(f => (
              <button
                key={f.key}
                className={`${styles.fuelTab} ${fuel === f.key ? styles.fuelTabActive : ''}`}
                onClick={() => setFuel(f.key)}
                disabled={!!lensFuels && !lensFuels.includes(f.key) && fuel !== f.key}
                title={lensFuels && !lensFuels.includes(f.key) ? `Not offered in ${COUNTRY_NAMES[lens.country] ?? lens.country}` : undefined}
              >
                {f.label}
              </button>
            ))}
          </div>
          <CurrencySelect />
          <button className={styles.ctaBtn} onClick={cheapestNearMe} disabled={ctaBusy}>
            {ctaBusy ? 'Locating…' : 'Cheapest near me'}
          </button>
          {loading && <div className={styles.loadingDot} />}
        </div>
        <div className={styles.modeBtns}>
          <button className={`${styles.modeBtn} ${mode === 'bbox' ? styles.modeBtnActive : ''}`} onClick={handleBboxMode}>Map view</button>
          <button className={`${styles.modeBtn} ${mode === 'near' ? styles.modeBtnActive : ''}`} onClick={handleNearMe} disabled={!userPos}>Near me</button>
        </div>
        {ctaMsg && <div className={styles.toast}>{ctaMsg}</div>}
      </div>

      <div className={styles.mapWrap}>
        <div className={styles.map}>
          <Map
            ref={mapRef}
            initialViewState={{ longitude: 15, latitude: 50, zoom: 4.3 }}
            onMove={e => {
              const z = e.viewState.zoom;
              setMapZoom(z);
              const below7 = z < 5.5;
              if (below7 !== prevZoomBelow7.current) {
                prevZoomBelow7.current = below7;
                setShowCountryBadges(below7);
                if (below7 && focusRef.current) applyFocus(null); // zoomed back out: all countries again
              }
            }}
            onLoad={handleMapLoad}
            onMoveEnd={e => { setMapCenter({ lng: e.viewState.longitude, lat: e.viewState.latitude }); handleMoveEnd(e); }}
            onClick={handleMapClick}
            onMouseEnter={e => { e.target.getCanvas().style.cursor = 'pointer'; }}
            onMouseLeave={e => { e.target.getCanvas().style.cursor = ''; }}
            interactiveLayerIds={['points']}
            mapStyle={MAP_STYLES[baseStyle].url}
            style={{ position: 'absolute', inset: 0 }}
            renderWorldCopies={false}
            minZoom={3.7}
            attributionControl={false}
          >
            {/* Declarative source/layers: react-map-gl re-attaches these after
                every basemap style switch (imperative addLayer would be wiped). */}
            <Source
              id="stations"
              type="geojson"
              data={stationsGeojson ?? { type: 'FeatureCollection', features: [] }}
              buffer={64}
              generateId
            >
              <Layer {...makeHeatmapLayer(baseStyle)} />
              <Layer {...makePointLayer(baseStyle)} />
            </Source>

            {/* Required attribution: OpenStreetMap (ODbL) basemap data + the tile
                vendor (MapTiler, or CARTO on the dev fallback). Compact = a small
                "ⓘ" that expands; the credits are always reachable. */}
            <AttributionControl
              compact
              customAttribution={[
                '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
                MAPTILER_KEY
                  ? '© <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">MapTiler</a>'
                  : '© <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>',
              ]}
            />
            {winner && (
              <Marker longitude={winner.lng} latitude={winner.lat} anchor="center">
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: '#141720', border: '3px solid #37D3A0',
                  boxShadow: '0 0 0 5px rgba(55,211,160,0.22), 0 4px 12px rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#37D3A0', zIndex: 5,
                }}>1</div>
              </Marker>
            )}
            {userPos && (
              <Marker longitude={userPos.lng} latitude={userPos.lat} anchor="center">
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#3b82f6', border: '3px solid #fff',
                  boxShadow: '0 0 0 3px rgba(59,130,246,0.3)',
                }} />
              </Marker>
            )}

            {badgePills.map(c => (
              <Marker key={c.country} longitude={c.lng} latitude={c.lat} anchor="center">
                <button
                  className={`${styles.countryPill} ${c.big ? styles.countryPillBig : ''}`}
                  onClick={() => focusCountry(c.country)}
                  aria-label={`Zoom to ${COUNTRY_NAMES[c.country] ?? c.country}`}
                >
                  <span className={styles.pillCc}>{c.country}</span>
                  <span
                    className={styles.pillPrice}
                    style={c.median != null ? { color: priceColor(c.median) } : undefined}
                  >
                    {c.median != null ? fmtCompact(c.median) : '—'}
                  </span>
                </button>
              </Marker>
            ))}
          </Map>

          <div className={styles.styleSwitch} role="radiogroup" aria-label="Map style">
            {Object.entries(MAP_STYLES).map(([key, s]) => (
              <button
                key={key}
                role="radio"
                aria-checked={baseStyle === key}
                className={`${styles.styleBtn} ${baseStyle === key ? styles.styleBtnActive : ''}`}
                onClick={() => switchBaseStyle(key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.sidebar}>
          {user && (
            <div className={styles.panelTabs}>
              <button
                className={`${styles.panelTab} ${panelTab === 'list' ? styles.panelTabActive : ''}`}
                onClick={() => setPanelTab('list')}
              >Explore</button>
              <button
                className={`${styles.panelTab} ${panelTab === 'saved' ? styles.panelTabActive : ''}`}
                onClick={() => setPanelTab('saved')}
              >Saved{favStations.length ? ` · ${favStations.length}` : ''}</button>
            </div>
          )}
          {user && panelTab === 'saved' ? (
            <>
              <div className={styles.sidebarHeader}>
                <span className={styles.sidebarCount}>{favStations.length} saved station{favStations.length === 1 ? '' : 's'}</span>
                <span className={styles.sidebarFuel}>{FUELS.find(f => f.key === fuel)?.label}</span>
              </div>
              <div className={styles.stationList}>
                {favStations.map((s, i) => {
                  const p = s.prices?.find(x => x.fuelType === fuel)?.price ?? s.price ?? null;
                  return (
                    <button
                      key={s.id}
                      className={`${styles.stationRow} ${selected?.id === s.id ? styles.stationRowActive : ''}`}
                      onClick={() => {
                        mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: 14, duration: 900 });
                        handleSelectStation({ ...s, price: p });
                      }}
                    >
                      <div className={styles.stationRowRank}>{i + 1}</div>
                      <div className={styles.stationRowBody}>
                        <div className={styles.stationRowName}>{s.name}</div>
                        <div className={styles.stationRowCity}>{FLAGS[s.country] ?? s.country} {s.city}</div>
                      </div>
                      <div className={styles.stationRowPrice} style={{ color: priceColor(p) }}>
                        {p ? fmt(p) : '—'}
                      </div>
                    </button>
                  );
                })}
                {!favStations.length && (
                  <div className={styles.emptyNote}>Tap Save on a station to keep it here.</div>
                )}
              </div>
            </>
          ) : showCountryBadges ? (
            /* Zoomed out: the country league for the selected fuel. Each row
               carries a price runway — its length encodes the national median
               on the cheapest→priciest span, tinted by the price-level color,
               so the whole panel reads as one bar chart. */
            <>
              <div className={styles.sidebarHeader}>
                <div>
                  <span className={styles.sidebarCount}>Cheapest countries</span>
                  <span className={styles.sidebarCaption}>national medians · {effCode}/L</span>
                </div>
                <span className={styles.sidebarFuel}>{FUELS.find(f => f.key === fuel)?.label}</span>
              </div>
              <div className={styles.stationList}>
                {(() => {
                  const rows = countryMeta
                    .filter(m => m.median != null && COUNTRY_CENTROIDS[m.country])
                    .sort((a, b) => a.median - b.median);
                  if (!rows.length) return null;
                  const min = rows[0].median;
                  const span = rows[rows.length - 1].median - min || 1;
                  return rows.map((m, i) => {
                    const color = priceColor(m.median);
                    const pct = 10 + 90 * ((m.median - min) / span);
                    return (
                      <button
                        key={m.country}
                        className={`${styles.stationRow} ${styles.leagueRow}`}
                        onClick={() => focusCountry(m.country)}
                      >
                        <span
                          className={styles.leagueBar}
                          style={{ width: `${pct}%`, background: `${color}12`, borderBottomColor: `${color}88` }}
                        />
                        <div className={`${styles.stationRowRank} ${i < 3 ? styles.rankTop : ''}`}>{i + 1}</div>
                        <div className={styles.stationRowBody}>
                          <div className={styles.stationRowName}>{FLAGS[m.country] ?? ''} {COUNTRY_NAMES[m.country] ?? m.country}</div>
                          <div className={styles.stationRowCity}>{m.stations.toLocaleString()} stations</div>
                        </div>
                        <div className={styles.stationRowPrice} style={{ color }}>
                          {fmt(m.median)}
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            </>
          ) : (
          <>
          {lens && (
            <div className={styles.lens}>
              <div className={styles.lensTitle}>{FLAGS[lens.country] ?? ''} {COUNTRY_NAMES[lens.country] ?? lens.country}</div>
              <div className={styles.lensStats}>
                {lens.median != null && (
                  <span>National median <b style={{ color: priceColor(lens.median) }}>{fmt(lens.median)}</b></span>
                )}
                <span>{lens.stations.toLocaleString()} stations</span>
              </div>
              <div className={styles.lensFuels}>
                {FUELS.filter(f => lens.fuels?.includes(f.key)).map(f => (
                  <span key={f.key} className={styles.lensFuel}>{f.label}</span>
                ))}
              </div>
            </div>
          )}
          <div className={styles.sidebarHeader}>
            {countryFocus ? (
              <div>
                <span className={styles.sidebarCount}>Cheapest in {COUNTRY_NAMES[countryFocus] ?? countryFocus}</span>
                <span className={styles.sidebarCaption}>
                  {lens?.stations
                    ? `top ${sidebarStations.length} of ${lens.stations.toLocaleString()} stations`
                    : `${sidebarStations.length} stations nationwide`}
                </span>
              </div>
            ) : (
              <span className={styles.sidebarCount}>{sidebarStations.length} stations</span>
            )}
            <div className={styles.headerChips}>
              <span className={styles.sidebarFuel}>{FUELS.find(f => f.key === fuel)?.label}</span>
              {countryFocus && (
                <button className={styles.focusExit} onClick={() => applyFocus(null)} title="Show stations in the current view instead">×</button>
              )}
            </div>
          </div>
          <div className={styles.stationList}>
            {sidebarStations.map((s, i) => (
              <button
                key={s.id}
                className={`${styles.stationRow} ${selected?.id === s.id ? styles.stationRowActive : ''}`}
                onClick={() => {
                  // Nationwide focus list: the station can be far outside the view
                  if (countryFocus) mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: 13, duration: 900 });
                  handleSelectStation(s);
                }}
              >
                <div className={styles.stationRowRank}>{i + 1}</div>
                <div className={styles.stationRowBody}>
                  <div className={styles.stationRowName}>{s.name}</div>
                  <div className={styles.stationRowCity}>
                    {FLAGS[s.country] ?? s.country} {s.city}{s.distance != null ? ` · ${s.distance} km` : ''}
                  </div>
                </div>
                <div className={styles.stationRowPrice} style={{ color: priceColor(s.price) }}>
                  {s.price ? fmt(s.price) : '—'}
                </div>
              </button>
            ))}
          </div>
          </>
          )}
        </div>
      </div>

      {selected && (
        <div
          className={styles.detailPanel}
          style={{ '--sheet-h': `${sheetHeight}px` }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className={styles.dragHandle} />
          <div className={styles.detailScroll}>
            <div className={styles.detailHeader}>
              <div className={styles.detailTitleBlock}>
                <div className={styles.detailName}>{selected.name}</div>
                <div className={styles.detailCity}>{FLAGS[selected.country] ?? selected.country} {selected.city} · {COUNTRY_LABEL[selected.country] ?? selected.country}</div>
              </div>
              <div className={styles.detailActions}>
                <a
                  className={styles.closeBtn}
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                  target="_blank" rel="noopener noreferrer"
                  title="Directions"
                >Directions</a>
                {user && (
                  <button
                    className={`${styles.favBtn} ${favorites.has(selected.id) ? styles.favBtnActive : ''}`}
                    onClick={() => toggleFavorite(selected.id)}
                  >
                    {favorites.has(selected.id) ? 'Saved' : 'Save'}
                  </button>
                )}
                <button className={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
              </div>
            </div>

            {/* Forecourt price totem: the station's fuels as a real price sign */}
            <div className={styles.priceBoard}>
              <div className={styles.boardHeader}>{(selected.brand || selected.name || '').toUpperCase()}</div>
              {FUELS
                .filter(f => (selected.allPrices?.[f.key] != null) || f.key === fuel)
                .map(f => {
                  const p = selected.allPrices?.[f.key] ?? (f.key === fuel ? selectedPrice : null);
                  const active = f.key === fuel;
                  const digits = ledDigits(convert(p));
                  return (
                    <div key={f.key} className={`${styles.boardRow} ${active ? styles.boardRowActive : ''}`}>
                      <span className={styles.boardFuel}>{f.label}</span>
                      <span className={styles.boardPrice} data-ghost={digits.replace(/\d/g, '8')}>{digits}</span>
                    </div>
                  );
                })}
              <div className={styles.boardFooter}>
                <span>{effCode} / LITRE</span>
                <span>
                  {selected.updatedAt && relAgo(selected.updatedAt) ? `UPDATED ${relAgo(selected.updatedAt).toUpperCase()}` : ''}
                  {selected.distance != null ? ` · ${selected.distance} KM` : ''}
                </span>
              </div>
            </div>

            {loadingHistory && <div className={styles.histSpinner} />}
            {!loadingHistory && history.length > 1 && (() => {
              const lo = Math.min(...history.map(h => h.price));
              const hi = Math.max(...history.map(h => h.price));
              return (
                <div className={styles.chartWrap}>
                  <div className={styles.chartHead}>
                    <span className={styles.chartTitle}>Price history · {FUELS.find(f => f.key === fuel)?.label}</span>
                    <span className={styles.chartRange}>
                      low <b style={{ color: '#2FBF84' }}>{fmt(lo)}</b> · high <b style={{ color: '#E25A5A' }}>{fmt(hi)}</b>
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={history} margin={{ top: 6, right: 2, bottom: 0, left: 2 }}>
                      <defs>
                        <linearGradient id="histFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#37D3A0" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#37D3A0" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#8A91A6', fontSize: 10 }}
                        tickLine={false} axisLine={false}
                        interval="preserveStartEnd" minTickGap={40}
                      />
                      <YAxis hide domain={[dataMin => dataMin * 0.995, dataMax => dataMax * 1.005]} />
                      <Tooltip
                        formatter={v => [fmt(Number(v)), null]}
                        separator=""
                        contentStyle={{ background: '#191D28', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', borderRadius: 8, color: '#F2F4F8', fontSize: 12 }}
                        labelStyle={{ color: '#8A91A6', fontSize: 11 }}
                        cursor={{ stroke: 'rgba(242,244,248,0.2)', strokeDasharray: '3 3' }}
                      />
                      <Area
                        type="monotone" dataKey="price"
                        stroke="#37D3A0" strokeWidth={2}
                        fill="url(#histFill)"
                        dot={false}
                        activeDot={{ r: 4, fill: '#37D3A0', stroke: '#0C0E13', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
