'use client';
import { useState, useEffect, useRef } from 'react';
import Map, { Marker, AttributionControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getStationsGeoJSON, getStation, getStationHistory, geocodeCity, addFavorite, removeFavorite, getFavorites, getCountryCounts } from '../../lib/api';
import { useUser } from '../../lib/context/UserContext';
import styles from './map.module.css';

// MapTiler (commercial-licensed) when a key is configured; CARTO's free style as a
// dev-only fallback (non-commercial — do not ship without the key).
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/basic-v2-dark/style.json?key=${MAPTILER_KEY}`
  : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

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

const FLAGS = { SI: '🇸🇮', FR: '🇫🇷', AT: '🇦🇹', HU: '🇭🇺', DE: '🇩🇪', CZ: '🇨🇿', SK: '🇸🇰', NL: '🇳🇱', BE: '🇧🇪', CH: '🇨🇭', PL: '🇵🇱', RO: '🇷🇴', HR: '🇭🇷', RS: '🇷🇸', ES: '🇪🇸', IT: '🇮🇹', PT: '🇵🇹', LU: '🇱🇺', LI: '🇱🇮', AD: '🇦🇩', MC: '🇲🇨', BG: '🇧🇬', GR: '🇬🇷', CY: '🇨🇾', MT: '🇲🇹', BA: '🇧🇦', ME: '🇲🇪', MK: '🇲🇰', AL: '🇦🇱', XK: '🇽🇰', GB: '🇬🇧', DK: '🇩🇰', NO: '🇳🇴', SE: '🇸🇪', FI: '🇫🇮', IE: '🇮🇪', LV: '🇱🇻', LT: '🇱🇹', EE: '🇪🇪', TR: '🇹🇷', AU: '🇦🇺', IS: '🇮🇸', MX: '🇲🇽', TW: '🇹🇼', MY: '🇲🇾', TH: '🇹🇭', NZ: '🇳🇿', KR: '🇰🇷', CA: '🇨🇦', CL: '🇨🇱', BR: '🇧🇷', AR: '🇦🇷', US: '🇺🇸', ZA: '🇿🇦', AE: '🇦🇪', SA: '🇸🇦', KE: '🇰🇪', DO: '🇩🇴', UY: '🇺🇾', QA: '🇶🇦', KW: '🇰🇼', OM: '🇴🇲', BH: '🇧🇭', BN: '🇧🇳', EC: '🇪🇨', VN: '🇻🇳', EG: '🇪🇬', JO: '🇯🇴', TN: '🇹🇳', MA: '🇲🇦', ID: '🇮🇩', IN: '🇮🇳', MD: '🇲🇩', IL: '🇮🇱', PK: '🇵🇰', JP: '🇯🇵', BD: '🇧🇩', LK: '🇱🇰', NP: '🇳🇵', CR: '🇨🇷', PA: '🇵🇦', AZ: '🇦🇿', DZ: '🇩🇿' };
const COUNTRY_LABEL = { GB: 'UK' };

function priceColor(p) {
  if (!p) return '#5A6072';
  if (p <= 1.60) return '#2FBF84';
  if (p <= 1.90) return '#E8A23D';
  return '#E25A5A';
}

// Heatmap — GPU-rendered density view at mid zoom
const heatmapLayer = {
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
      0.2,  'rgba(47,191,132,0.5)',
      0.5,  'rgba(232,162,61,0.7)',
      0.8,  'rgba(226,90,90,0.85)',
      1,    'rgba(226,90,90,0.95)',
    ],
    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 12.5, 0],
  },
};

// Individual station dot — fades in as heatmap fades out
const pointLayer = {
  id: 'points',
  type: 'circle',
  source: 'stations',
  minzoom: 10,
  paint: {
    'circle-color': [
      'case',
      ['<', ['get', 'price'], 0], '#5A6072',
      ['<', ['get', 'price'], 1.60], '#2FBF84',
      ['<', ['get', 'price'], 1.90], '#E8A23D',
      '#E25A5A',
    ],
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 12, 6, 15, 10],
    'circle-stroke-width': 1.5,
    'circle-stroke-color': 'rgba(255,255,255,0.25)',
    'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0, 12.5, 0.9],
  },
};

const COUNTRY_CENTROIDS = {
  SI: { lng: 14.82, lat: 46.15 },
  AT: { lng: 14.55, lat: 47.60 },
  HU: { lng: 19.40, lat: 47.18 },
  FR: { lng:  2.35, lat: 46.60 },
  DE: { lng: 10.45, lat: 51.17 },
  CZ: { lng: 15.50, lat: 49.80 },
  SK: { lng: 19.50, lat: 48.80 },
  NL: { lng:  5.29, lat: 52.13 },
  BE: { lng:  4.47, lat: 50.50 },
  CH: { lng:  8.23, lat: 46.82 },
  PL: { lng: 19.50, lat: 52.10 },
  RO: { lng: 25.00, lat: 45.94 },
  HR: { lng: 15.20, lat: 45.10 },
  RS: { lng: 21.00, lat: 44.02 },
  ES: { lng: -3.70, lat: 40.00 },
  IT: { lng: 12.57, lat: 42.50 },
  PT: { lng: -8.00, lat: 39.50 },
  LU: { lng:  6.13, lat: 49.82 },
  LI: { lng:  9.56, lat: 47.16 },
  AD: { lng:  1.57, lat: 42.55 },
  MC: { lng:  7.42, lat: 43.74 },
  BG: { lng: 25.50, lat: 42.70 },
  GR: { lng: 22.00, lat: 39.00 },
  CY: { lng: 33.20, lat: 35.00 },
  MT: { lng: 14.40, lat: 35.92 },
  BA: { lng: 17.50, lat: 44.00 },
  ME: { lng: 19.40, lat: 42.70 },
  MK: { lng: 21.70, lat: 41.60 },
  AL: { lng: 20.10, lat: 41.10 },
  XK: { lng: 20.90, lat: 42.60 },
  GB: { lng: -1.50, lat: 53.00 },
  DK: { lng: 10.00, lat: 56.00 },
  NO: { lng:  8.50, lat: 62.00 },
  SE: { lng: 17.50, lat: 62.50 },
  FI: { lng: 26.00, lat: 64.50 },
  IE: { lng: -8.00, lat: 53.50 },
  LV: { lng: 24.60, lat: 56.88 },
  LT: { lng: 23.88, lat: 55.17 },
  EE: { lng: 25.01, lat: 58.60 },
  TR: { lng: 35.24, lat: 38.96 },
  AU: { lng: 133.5,  lat: -25.0 },
  IS: { lng: -18.5,  lat: 65.0  },
  MX: { lng: -102.5, lat: 23.6  },
  TW: { lng:  121.0, lat: 23.7  },
  MY: { lng:  109.7, lat:   3.8 },
  TH: { lng:  100.9, lat:  15.9 },
  NZ: { lng:  174.9, lat: -40.9 },
  KR: { lng:  127.7, lat:  36.5 },
  CA: { lng:  -96.5, lat:  56.0 },
  CL: { lng:  -71.0, lat: -35.5 },
  BR: { lng:  -51.0, lat: -10.5 },
  AR: { lng:  -64.5, lat: -38.0 },
  US: { lng:  -98.5, lat:  39.5 },
  ZA: { lng:   25.0, lat: -29.0 },
  AE: { lng:   54.0, lat:  24.0 },
  SA: { lng:   45.0, lat:  24.0 },
  KE: { lng:   37.9, lat:   0.2 },
  DO: { lng:  -70.5, lat:  18.8 },
  UY: { lng:  -56.0, lat: -32.8 },
  QA: { lng:   51.2, lat:  25.3 },
  KW: { lng:   47.6, lat:  29.3 },
  OM: { lng:   56.0, lat:  21.0 },
  BH: { lng:   50.55, lat: 26.07 },
  BN: { lng:  114.7, lat:   4.5 },
  EC: { lng:  -78.5, lat:  -1.5 },
  VN: { lng:  106.0, lat:  16.5 },
  EG: { lng:   30.0, lat:  26.5 },
  JO: { lng:   36.8, lat:  31.3 },
  TN: { lng:    9.5, lat:  34.5 },
  MA: { lng:   -6.5, lat:  32.0 },
  ID: { lng:  113.0, lat:  -2.0 },
  IN: { lng:   78.5, lat:  22.0 },
  MD: { lng:   28.5, lat:  47.2 },
  IL: { lng:   34.9, lat:  31.4 },
  PK: { lng:   69.5, lat:  29.5 },
  JP: { lng:  138.5, lat:  36.5 },
  BD: { lng:   90.3, lat:  23.8 },
  LK: { lng:   80.7, lat:   7.6 },
  NP: { lng:   84.0, lat:  28.2 },
  CR: { lng:  -84.2, lat:   9.9 },
  PA: { lng:  -80.1, lat:   8.5 },
  AZ: { lng:   47.5, lat:  40.3 },
  DZ: { lng:    2.6, lat:  28.0 },
};

// Badge-eligible countries = everything with a centroid. Derived (not a separate
// hand-maintained list) so newly added countries can't silently miss a badge —
// countryTotals still gates rendering to countries that actually have stations.
const COUNTRIES = Object.keys(COUNTRY_CENTROIDS);

const COUNTRY_SCALE = { ES: 1.2, IT: 1.15, FR: 1.25, DE: 1.2, PL: 1.1, RO: 1.0, AT: 1.0, HU: 1.0, PT: 0.9, CZ: 0.95, NL: 0.85, SK: 0.8, BE: 0.8, CH: 0.75, HR: 0.75, SI: 0.65, RS: 0.7, LU: 0.5, LI: 0.35, AD: 0.35, MC: 0.3, BG: 0.8, GR: 1.0, CY: 0.5, MT: 0.35, BA: 0.75, ME: 0.5, MK: 0.55, AL: 0.55, XK: 0.4, GB: 1.2, DK: 0.8, NO: 1.1, SE: 1.2, FI: 1.1, IE: 0.75, LV: 0.75, LT: 0.75, EE: 0.65, TR: 1.4, AU: 1.8, IS: 0.7, MX: 1.4, TW: 0.6, MY: 1.1, TH: 1.1, NZ: 1.0, KR: 0.9, CA: 1.9, CL: 0.85, BR: 1.9, AR: 1.5, US: 2.2, ZA: 1.2, AE: 0.6, SA: 1.4, KE: 1.0, DO: 0.55, UY: 0.7, QA: 0.45, KW: 0.5, OM: 1.0, BH: 0.35, BN: 0.45, EC: 0.9, VN: 1.1, EG: 1.2, JO: 0.6, TN: 0.7, MA: 1.0, ID: 1.8, IN: 2.0, MD: 0.55, IL: 0.6, PK: 1.3, JP: 1.3, BD: 0.8, LK: 0.6, NP: 0.6, CR: 0.55, PA: 0.55, AZ: 0.65, DZ: 1.2 };

export default function MapView() {
  const { user } = useUser() ?? {};
  const [fuel, setFuel] = useState('diesel');
  const [sidebarStations, setSidebarStations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [userPos, setUserPos] = useState(null);
  const [winner, setWinner] = useState(null);   // cheapest-near-me highlighted station
  const [ctaBusy, setCtaBusy] = useState(false);
  const [ctaMsg, setCtaMsg] = useState(null);
  const [citySearch, setCitySearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('bbox');
  const [showCountryBadges, setShowCountryBadges] = useState(true);
  const [mapZoom, setMapZoom] = useState(2);
  const [countryTotals, setCountryTotals] = useState({});

  const mapRef = useRef(null);
  const allStations = useRef([]);   // full in-memory station list for current fuel
  const mapLoaded = useRef(false);
  const modeRef = useRef('bbox');
  const fuelRef = useRef(fuel);
  const prevZoomBelow7 = useRef(true);
  fuelRef.current = fuel;
  modeRef.current = mode;


  useEffect(() => {
    if (user) getFavorites().then(favs => setFavorites(new Set(favs.map(f => f.id))));
  }, [user]);

  // Country badge totals — fuel-agnostic: a badge shows for every country with
  // any stations, regardless of selected fuel (e.g. Canada has only gasoline).
  // Loaded once from /counts; not tied to the per-fuel station list.
  useEffect(() => {
    getCountryCounts().then(setCountryTotals).catch(() => {});
  }, []);

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
  function updateSidebar() {
    if (modeRef.current !== 'bbox') return;
    const map = mapRef.current?.getMap();
    if (!map || !allStations.current.length) return;
    const b = map.getBounds();
    const [sv, w, n, e] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    const visible = allStations.current
      .filter(s => s.lat >= sv && s.lat <= n && s.lng >= w && s.lng <= e)
      .sort((a, b) => (a.price ?? 9) - (b.price ?? 9))
      .slice(0, 100);
    setSidebarStations(visible);
  }

  // Load all stations for a fuel type: one request, cached 30 min by the browser.
  // After loading, push GeoJSON into MapLibre and refresh the sidebar in-memory.
  async function loadStations(fuelType) {
    setLoading(true);
    try {
      const geojson = await getStationsGeoJSON(fuelType);
      const map = mapRef.current?.getMap();
      const src = map?.getSource('stations');
      if (src) src.setData(geojson);
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
    const map = e.target;
    map.addSource('stations', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      buffer: 64,
      generateId: true,
    });
    map.addLayer(heatmapLayer);
    map.addLayer(pointLayer);
    mapLoaded.current = true;
    loadStations(fuelRef.current);
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
    setMode('bbox');
    modeRef.current = 'bbox';
    updateSidebar();
  }

  async function handleCitySearch(e) {
    e.preventDefault();
    if (!citySearch.trim()) return;
    setLoading(true);
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
    } else {
      await addFavorite(stationId);
      setFavorites(s => new Set([...s, stationId]));
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

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.commandBar}>
          <form onSubmit={handleCitySearch} className={styles.searchForm}>
            <input className={styles.searchInput} placeholder="Search city…" value={citySearch} onChange={e => setCitySearch(e.target.value)} />
            <button className={styles.searchBtn} type="submit">Go</button>
          </form>
          <div className={styles.fuelTabs}>
            {FUELS.map(f => (
              <button key={f.key} className={`${styles.fuelTab} ${fuel === f.key ? styles.fuelTabActive : ''}`} onClick={() => setFuel(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <button className={styles.ctaBtn} onClick={cheapestNearMe} disabled={ctaBusy}>
            {ctaBusy ? 'Locating…' : '⛽ Cheapest near me'}
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
              }
            }}
            onLoad={handleMapLoad}
            onMoveEnd={handleMoveEnd}
            onClick={handleMapClick}
            onMouseEnter={e => { e.target.getCanvas().style.cursor = 'pointer'; }}
            onMouseLeave={e => { e.target.getCanvas().style.cursor = ''; }}
            interactiveLayerIds={['points']}
            mapStyle={MAP_STYLE}
            style={{ position: 'absolute', inset: 0 }}
            renderWorldCopies={false}
            minZoom={3.7}
            attributionControl={false}
          >
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
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#141720', border: '3px solid #37D3A0',
                  boxShadow: '0 0 0 5px rgba(55,211,160,0.22), 0 4px 12px rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, zIndex: 5,
                }}>⭐</div>
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

            {showCountryBadges && COUNTRIES.map(country => {
              const count = countryTotals[country];
              if (!count) return null;
              const { lng, lat } = COUNTRY_CENTROIDS[country];
              const label = count >= 1000 ? (count / 1000).toFixed(1) + 'k' : String(count);
              const base = Math.max(22, Math.min(46, mapZoom * 8.5));
              const sz = Math.round(base * (COUNTRY_SCALE[country] ?? 1));
              return (
                <Marker key={country} longitude={lng} latitude={lat} anchor="center">
                  <div style={{
                    background: '#141720',
                    border: `${sz > 32 ? 2 : 1.5}px solid rgba(232,234,240,0.14)`,
                    borderRadius: '50%',
                    width: sz, height: sz,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    color: '#e8eaf0',
                    fontSize: Math.max(6, sz * 0.2), fontWeight: 700,
                    pointerEvents: 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
                    userSelect: 'none',
                  }}>
                    <span style={{ fontSize: Math.max(10, sz * 0.35), lineHeight: 1 }}>{FLAGS[country]}</span>
                    <span style={{ marginTop: 1 }}>{label}</span>
                  </div>
                </Marker>
              );
            })}
          </Map>
        </div>

        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarCount}>{sidebarStations.length} stations</span>
            <span className={styles.sidebarFuel}>{FUELS.find(f => f.key === fuel)?.label}</span>
          </div>
          <div className={styles.stationList}>
            {sidebarStations.map((s, i) => (
              <button
                key={s.id}
                className={`${styles.stationRow} ${selected?.id === s.id ? styles.stationRowActive : ''}`}
                onClick={() => handleSelectStation(s)}
              >
                <div className={styles.stationRowRank}>{i + 1}</div>
                <div className={styles.stationRowBody}>
                  <div className={styles.stationRowName}>{s.name}</div>
                  <div className={styles.stationRowCity}>
                    {FLAGS[s.country] ?? s.country} {s.city}{s.distance != null ? ` · ${s.distance} km` : ''}
                  </div>
                </div>
                <div className={styles.stationRowPrice} style={{ color: priceColor(s.price) }}>
                  {s.price ? `€${s.price.toFixed(3)}` : '—'}
                </div>
              </button>
            ))}
          </div>
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
                {user && (
                  <button
                    className={`${styles.favBtn} ${favorites.has(selected.id) ? styles.favBtnActive : ''}`}
                    onClick={() => toggleFavorite(selected.id)}
                  >
                    {favorites.has(selected.id) ? '★' : '☆'}
                  </button>
                )}
                <button className={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
              </div>
            </div>

            <div className={styles.detailPriceHero}>
              <span className={styles.detailFuelLabel}>{FUELS.find(f => f.key === fuel)?.label ?? fuel}</span>
              <span className={styles.detailPriceBig} style={{ color: priceColor(selectedPrice) }}>
                {selectedPrice ? `€${selectedPrice.toFixed(3)}` : '—'}
              </span>
              {selected.distance != null && (
                <span className={styles.detailDistance}>{selected.distance} km away</span>
              )}
            </div>

            {selected.allPrices && Object.keys(selected.allPrices).length > 1 && (
              <div className={styles.allPrices}>
                {Object.entries(selected.allPrices).filter(([ft]) => ft !== fuel).map(([ft, p]) => (
                  <div key={ft} className={styles.priceChip}>
                    <span className={styles.priceChipLabel}>{FUELS.find(f => f.key === ft)?.label ?? ft}</span>
                    <span className={styles.priceChipVal} style={{ color: priceColor(p) }}>€{p.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            )}

            {loadingHistory && <div className={styles.histSpinner} />}
            {!loadingHistory && history.length > 1 && (
              <div className={styles.chartWrap}>
                <div className={styles.chartTitle}>Price history · {FUELS.find(f => f.key === fuel)?.label}</div>
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <XAxis dataKey="date" tick={{ fill: '#7b8099', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#7b8099', fontSize: 10 }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ background: '#191D28', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', borderRadius: 8, color: '#F2F4F8', fontSize: 12 }} />
                    <Line type="monotone" dataKey="price" stroke="#37D3A0" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
