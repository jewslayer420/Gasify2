'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Map, { Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getStations, getStationHistory, geocodeCity, addFavorite, removeFavorite, getFavorites, getCountryCounts } from '../../lib/api';
import { useUser } from '../../lib/context/UserContext';
import styles from './map.module.css';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

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

const FLAGS = { SI: '🇸🇮', FR: '🇫🇷', AT: '🇦🇹', HU: '🇭🇺', DE: '🇩🇪', CZ: '🇨🇿', SK: '🇸🇰' };

function priceColor(p) {
  if (!p) return '#4b5563';
  if (p <= 1.60) return '#22c55e';
  if (p <= 1.90) return '#f97316';
  return '#ef4444';
}

function toGeoJSON(stations) {
  return {
    type: 'FeatureCollection',
    features: stations.map(s => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        name: s.name,
        price: s.price ?? -1,
        city: s.city,
        country: s.country,
        distance: s.distance ?? -1,
        lat: s.lat,
        lng: s.lng,
        allPrices: JSON.stringify(s.allPrices || {}),
      },
    })),
  };
}

// Cluster bubble — radius caps at 28px regardless of how many countries are added
const clusterLayer = {
  id: 'clusters',
  type: 'circle',
  source: 'stations',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#1a1d2b',
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      2,  11,   // fully zoomed out → tiny
      5,  14,   // country level
      8,  18,   // region level
      12, 20,   // city level
    ],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#22c55e',
    'circle-opacity': 0.95,
    'circle-opacity-transition': { duration: 0 },
    'circle-radius-transition': { duration: 0 },
    'circle-stroke-opacity-transition': { duration: 0 },
  },
};

// Cluster count — same font CartoDB dark matter uses for map labels = already cached, no glyph delay
const clusterCountLayer = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'stations',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
    'text-size': [
      'interpolate', ['linear'], ['zoom'],
      2,  9,
      5,  10,
      8,  11,
    ],
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: {
    'text-color': '#e8eaf0',
    'text-opacity-transition': { duration: 0 },
  },
};

const COUNTRIES = ['SI', 'AT', 'FR', 'HU', 'DE', 'CZ', 'SK'];

// True geographic centres for each country.
// AT uses real centre (~13.2°E) not the eastern tip (which would overlap SI at 14.8°E).
const COUNTRY_CENTROIDS = {
  SI: { lng: 14.82, lat: 46.12 },
  AT: { lng: 13.20, lat: 47.60 },
  HU: { lng: 19.50, lat: 47.18 },
  FR: { lng:  2.35, lat: 46.60 },
  DE: { lng: 10.45, lat: 51.17 },
  CZ: { lng: 15.47, lat: 49.82 },
  SK: { lng: 19.20, lat: 48.70 },
};

// Individual station dot — color driven by price via MapLibre expression
const pointLayer = {
  id: 'points',
  type: 'circle',
  source: 'stations',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': [
      'case',
      ['<', ['get', 'price'], 0], '#4b5563',
      ['<', ['get', 'price'], 1.60], '#22c55e',
      ['<', ['get', 'price'], 1.90], '#f97316',
      '#ef4444',
    ],
    'circle-radius': 8,
    'circle-stroke-width': 1.5,
    'circle-stroke-color': 'rgba(255,255,255,0.2)',
    'circle-opacity': 0.92,
  },
};

export default function MapView() {
  const { user } = useUser() ?? {};
  const [fuel, setFuel] = useState('diesel');
  const [stations, setStations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [userPos, setUserPos] = useState(null);
  const [citySearch, setCitySearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('bbox');
  const [showCountryBadges, setShowCountryBadges] = useState(false); // initial zoom 9 > 7
  const [countryTotals, setCountryTotals] = useState({});

  const mapRef = useRef(null);
  const bboxTimer = useRef(null);
  const modeRef = useRef('bbox');
  const fuelRef = useRef(fuel);
  const zoomRef = useRef(9);
  const prevZoomBelow7 = useRef(false);
  fuelRef.current = fuel;
  modeRef.current = mode;

  // Fetch total station counts per country once on mount (used for country-level overview bubbles)
  useEffect(() => {
    getCountryCounts().then(setCountryTotals).catch(() => {});
  }, []);

  // Push station data into the single MapLibre source whenever stations change
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const src = map.getSource('stations');
    if (src) src.setData(toGeoJSON(stations));
  }, [stations]);

  useEffect(() => {
    if (user) getFavorites().then(favs => setFavorites(new Set(favs.map(f => f.id))));
  }, [user]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      pos => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      null,
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const fetchByBbox = useCallback((bbox) => {
    if (modeRef.current !== 'bbox') return;
    if (zoomRef.current < 7) return;  // country badges don't need station data
    clearTimeout(bboxTimer.current);
    bboxTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await getStations({ fuel: fuelRef.current, bbox, zoom: Math.floor(zoomRef.current) });
        setStations(data);
      } catch {}
      setLoading(false);
    }, 300);
  }, []);

  const fetchNear = useCallback(async (lat, lng) => {
    setLoading(true);
    try {
      const data = await getStations({ fuel: fuelRef.current, near: true, lat, lng });
      setStations(data);
    } catch {}
    setLoading(false);
  }, []);

  function bboxFromMap(map) {
    const b = map.getBounds();
    return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  }

  const prevFuel = useRef(fuel);
  useEffect(() => {
    if (prevFuel.current === fuel) return;
    prevFuel.current = fuel;
    if (mode === 'near' && userPos) {
      fetchNear(userPos.lat, userPos.lng);
    } else if (mapRef.current) {
      fetchByBbox(bboxFromMap(mapRef.current));
    }
    // Refresh history for the open station with the new fuel
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
  }, [fuel, mode, userPos, fetchNear, fetchByBbox, selected]);

  function handleMapLoad(e) {
    const map = e.target;
    map.addSource('stations', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
      buffer: 64,
      generateId: true,
    });
    map.addLayer({ ...clusterLayer, minzoom: 7 });
    map.addLayer({ ...clusterCountLayer, minzoom: 7 });
    map.addLayer({ ...pointLayer, minzoom: 7 });
    fetchByBbox(bboxFromMap(map));
  }

  function handleMoveEnd(e) {
    zoomRef.current = e.target.getZoom();
    fetchByBbox(bboxFromMap(e.target));
  }

  async function handleMapClick(e) {
    if (!e.features?.length) return;
    const feature = e.features[0];
    const map = e.target;

    if (feature.layer.id === 'clusters') {
      try {
        const zoom = await map.getSource('stations').getClusterExpansionZoom(feature.properties.cluster_id);
        map.flyTo({ center: feature.geometry.coordinates, zoom: zoom + 0.5, duration: 450 });
      } catch {}
    } else if (feature.layer.id === 'points') {
      const p = feature.properties;
      handleSelectStation({
        id: p.id, name: p.name, city: p.city, country: p.country,
        lat: p.lat, lng: p.lng,
        price: p.price < 0 ? null : p.price,
        distance: p.distance < 0 ? null : p.distance,
        allPrices: JSON.parse(p.allPrices || '{}'),
      });
    }
  }

  function handleNearMe() {
    if (!userPos) return;
    setMode('near');
    mapRef.current?.flyTo({ center: [userPos.lng, userPos.lat], zoom: 13, duration: 800 });
    fetchNear(userPos.lat, userPos.lng);
  }

  function handleBboxMode() {
    setMode('bbox');
    if (mapRef.current) fetchByBbox(bboxFromMap(mapRef.current));
  }

  async function handleCitySearch(e) {
    e.preventDefault();
    if (!citySearch.trim()) return;
    setLoading(true);
    setMode('bbox');
    try {
      const [geo, data] = await Promise.all([
        geocodeCity(citySearch.trim()),
        getStations({ fuel, city: citySearch.trim() }),
      ]);
      setStations(data);
      if (geo) {
        let zoom = 13;
        if (geo.boundingBox) {
          const span = Math.abs(geo.boundingBox[1] - geo.boundingBox[0]);
          if (span > 0.3) zoom = 11;
          else if (span > 0.1) zoom = 12;
        }
        mapRef.current?.flyTo({ center: [geo.lng, geo.lat], zoom, duration: 900 });
      } else if (data.length) {
        mapRef.current?.flyTo({ center: [data[0].lng, data[0].lat], zoom: 13, duration: 900 });
      }
    } catch {}
    setLoading(false);
  }

  async function handleSelectStation(station) {
    setSelected(station);
    setHistory([]);
    setLoadingHistory(true);
    try {
      const h = await getStationHistory(station.id, fuelRef.current);
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

  const sortedStations = useMemo(
    () => [...stations].sort((a, b) => (a.price ?? 9) - (b.price ?? 9)),
    [stations]
  );

  // Always read price from allPrices so it updates when fuel tab changes
  const selectedPrice = selected ? (selected.allPrices?.[fuel] ?? null) : null;

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.fuelTabs}>
          {FUELS.map(f => (
            <button key={f.key} className={`${styles.fuelTab} ${fuel === f.key ? styles.fuelTabActive : ''}`} onClick={() => setFuel(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <form onSubmit={handleCitySearch} className={styles.searchForm}>
          <input className={styles.searchInput} placeholder="Search city…" value={citySearch} onChange={e => setCitySearch(e.target.value)} />
          <button className={styles.searchBtn} type="submit">Go</button>
        </form>
        <div className={styles.modeBtns}>
          <button className={`${styles.modeBtn} ${mode === 'bbox' ? styles.modeBtnActive : ''}`} onClick={handleBboxMode}>Map view</button>
          <button className={`${styles.modeBtn} ${mode === 'near' ? styles.modeBtnActive : ''}`} onClick={handleNearMe} disabled={!userPos}>Near me</button>
        </div>
        {loading && <div className={styles.loadingDot} />}
      </div>

      <div className={styles.mapWrap}>
        <div className={styles.map}>
          <Map
            ref={mapRef}
            initialViewState={{ longitude: 14.5, latitude: 46.1, zoom: 9 }}
            onMove={e => {
              const z = e.viewState.zoom;
              zoomRef.current = z;
              const below7 = z < 7;
              if (below7 !== prevZoomBelow7.current) {
                prevZoomBelow7.current = below7;
                setShowCountryBadges(below7);
                if (below7) {
                  // Clear source so supercluster has 0 features to process while zoomed out
                  const src = e.target.getSource('stations');
                  if (src) src.setData({ type: 'FeatureCollection', features: [] });
                }
              }
            }}
            onLoad={handleMapLoad}
            onMoveEnd={handleMoveEnd}
            onClick={handleMapClick}
            onMouseEnter={e => { e.target.getCanvas().style.cursor = 'pointer'; }}
            onMouseLeave={e => { e.target.getCanvas().style.cursor = ''; }}
            interactiveLayerIds={['clusters', 'points']}
            mapStyle={MAP_STYLE}
            style={{ position: 'absolute', inset: 0 }}
            renderWorldCopies={false}
            minZoom={3}
            attributionControl={false}
          >
            {/* Sources and layers are added imperatively in handleMapLoad */}

            {userPos && (
              <Marker longitude={userPos.lng} latitude={userPos.lat} anchor="center">
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#3b82f6', border: '3px solid #fff',
                  boxShadow: '0 0 0 3px rgba(59,130,246,0.3)',
                }} />
              </Marker>
            )}

            {/* Country-level overview badges — shown when zoomed out (zoom < 7).
                MapLibre layers have minzoom:7 so they are natively invisible below that.
                React badges use fixed centroids so they can never merge across countries. */}
            {showCountryBadges && COUNTRIES.map(country => {
              const count = countryTotals[country];
              if (!count) return null;
              const { lng, lat } = COUNTRY_CENTROIDS[country];
              const label = count >= 1000 ? (count / 1000).toFixed(1) + 'k' : String(count);
              return (
                <Marker key={country} longitude={lng} latitude={lat} anchor="center">
                  <div style={{
                    background: '#1a1d2b',
                    border: '2px solid #22c55e',
                    borderRadius: '50%',
                    width: 44, height: 44,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    color: '#e8eaf0',
                    fontSize: 9, fontWeight: 700,
                    pointerEvents: 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
                    userSelect: 'none',
                  }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{FLAGS[country]}</span>
                    <span style={{ marginTop: 1 }}>{label}</span>
                  </div>
                </Marker>
              );
            })}
          </Map>
        </div>

        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarCount}>
              {stations.length > 100 ? `${stations.length} stations (top 100)` : `${stations.length} stations`}
            </span>
            <span className={styles.sidebarFuel}>{FUELS.find(f => f.key === fuel)?.label}</span>
          </div>
          <div className={styles.stationList}>
            {sortedStations.slice(0, 100).map((s, i) => (
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
                <div className={styles.detailCity}>{FLAGS[selected.country] ?? selected.country} {selected.city} · {selected.country}</div>
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
                    <Tooltip contentStyle={{ background: '#1e2130', border: '1px solid #2a2d3e', borderRadius: 8, color: '#e8eaf0', fontSize: 12 }} />
                    <Line type="monotone" dataKey="price" stroke="#22c55e" strokeWidth={2} dot={false} />
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
