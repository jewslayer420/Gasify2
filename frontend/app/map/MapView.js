'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getStations, getStationHistory, geocodeCity, addFavorite, removeFavorite, getFavorites } from '../../lib/api';
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

const FLAGS = { SI: '🇸🇮', FR: '🇫🇷', AT: '🇦🇹' };

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
  const [geojson, setGeojson] = useState({ type: 'FeatureCollection', features: [] });
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [userPos, setUserPos] = useState(null);
  const [citySearch, setCitySearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('bbox');
  const [cursor, setCursor] = useState('auto');
  const [viewState, setViewState] = useState({ longitude: 14.5, latitude: 46.1, zoom: 9 });

  const mapRef = useRef(null);
  const bboxTimer = useRef(null);
  const modeRef = useRef('bbox');
  const fuelRef = useRef(fuel);
  fuelRef.current = fuel;
  modeRef.current = mode;

  useEffect(() => { setGeojson(toGeoJSON(stations)); }, [stations]);

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
    clearTimeout(bboxTimer.current);
    bboxTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await getStations({ fuel: fuelRef.current, bbox });
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
    fetchByBbox(bboxFromMap(e.target));
  }

  function handleMoveEnd(e) {
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

  const sortedStations = [...stations].sort((a, b) => (a.price ?? 9) - (b.price ?? 9));

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
            {...viewState}
            onMove={e => setViewState(e.viewState)}
            onLoad={handleMapLoad}
            onMoveEnd={handleMoveEnd}
            onClick={handleMapClick}
            onMouseEnter={() => setCursor('pointer')}
            onMouseLeave={() => setCursor('auto')}
            interactiveLayerIds={['clusters', 'points']}
            cursor={cursor}
            mapStyle={MAP_STYLE}
            style={{ position: 'absolute', inset: 0 }}
            renderWorldCopies={false}
            minZoom={3}
            attributionControl={false}
          >
            <Source
              id="stations"
              type="geojson"
              data={geojson}
              cluster
              clusterMaxZoom={14}
              clusterRadius={80}
              buffer={64}
              generateId
            >
              <Layer {...clusterLayer} />
              <Layer {...clusterCountLayer} />
              <Layer {...pointLayer} />
            </Source>

            {userPos && (
              <Marker longitude={userPos.lng} latitude={userPos.lat} anchor="center">
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#3b82f6', border: '3px solid #fff',
                  boxShadow: '0 0 0 3px rgba(59,130,246,0.3)',
                }} />
              </Marker>
            )}
          </Map>
        </div>

        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarCount}>{stations.length} stations</span>
            <span className={styles.sidebarFuel}>{FUELS.find(f => f.key === fuel)?.label}</span>
          </div>
          <div className={styles.stationList}>
            {sortedStations.map((s, i) => (
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
