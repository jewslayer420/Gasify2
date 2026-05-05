'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getStations, getStationHistory, geocodeCity, addFavorite, removeFavorite, getFavorites } from '../../lib/api';
import { useUser } from '../../lib/context/UserContext';
import styles from './map.module.css';

const FUELS = [
  { key: 'diesel', label: 'Diesel' },
  { key: 'sp95', label: '95' },
  { key: 'sp98', label: '98' },
  { key: 'lpg', label: 'LPG' },
];

const FLAGS = { SI: '🇸🇮', FR: '🇫🇷', AT: '🇦🇹', HR: '🇭🇷', HU: '🇭🇺' };

function priceColor(p) {
  if (!p) return '#4b5563';
  if (p <= 1.60) return '#22c55e';
  if (p <= 1.90) return '#f97316';
  return '#ef4444';
}

function getBbox(map) {
  const b = map.getBounds();
  return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
}

function createStationIcon(price) {
  const color = priceColor(price);
  const d = price ? 14 : 10;
  return L.divIcon({
    className: '',
    html: `<div style="width:${d}px;height:${d}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.2);box-shadow:0 0 0 3px ${color}30"></div>`,
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
  });
}

function createClusterIcon(cluster) {
  const n = cluster.getChildCount();
  const size = n < 10 ? 38 : n < 100 ? 44 : 52;
  const fs = n < 10 ? 14 : 12;
  return L.divIcon({
    className: '',
    html: `<div class="gasify-cluster-icon" style="width:${size}px;height:${size}px;border-radius:50%;background:#1e2130;border:2px solid #22c55e;display:flex;align-items:center;justify-content:center;color:#e8eaf0;font-size:${fs}px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 2px 14px rgba(0,0,0,0.55)">${n}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function MapController({ mapRef, onBboxChange }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    onBboxChange(getBbox(map));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  useMapEvents({
    moveend: () => onBboxChange(getBbox(map)),
    zoomend: () => onBboxChange(getBbox(map)),
  });
  return null;
}

function FlyTo({ coords, zoom = 13, onDone }) {
  const map = useMap();
  useEffect(() => {
    if (!coords) return;
    map.flyTo([coords.lat, coords.lng], zoom, { duration: 1 });
    onDone();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);
  return null;
}

export default function MapView() {
  const { user } = useUser() ?? {};
  const [fuel, setFuel] = useState('diesel');
  const [stations, setStations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [userPos, setUserPos] = useState(null);
  const [flyTo, setFlyTo] = useState(null);
  const [citySearch, setCitySearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('bbox');
  const mapRef = useRef(null);
  const bboxRef = useRef(null);
  const bboxTimer = useRef(null);
  const modeRef = useRef('bbox');
  const userPosRef = useRef(null);
  const fuelRef = useRef(fuel);
  fuelRef.current = fuel;
  modeRef.current = mode;
  userPosRef.current = userPos;

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
    bboxRef.current = bbox;
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

  const prevFuel = useRef(fuel);
  useEffect(() => {
    if (prevFuel.current === fuel) return;
    prevFuel.current = fuel;
    if (mode === 'near' && userPos) {
      fetchNear(userPos.lat, userPos.lng);
    } else if (bboxRef.current) {
      fetchByBbox(bboxRef.current);
    }
  }, [fuel, mode, userPos, fetchNear, fetchByBbox]);

  function handleNearMe() {
    if (!userPos) return;
    setMode('near');
    setFlyTo({ lat: userPos.lat, lng: userPos.lng });
    fetchNear(userPos.lat, userPos.lng);
  }

  function handleBboxMode() {
    setMode('bbox');
    if (bboxRef.current) fetchByBbox(bboxRef.current);
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
          const latSpan = Math.abs(geo.boundingBox[1] - geo.boundingBox[0]);
          if (latSpan > 0.3) zoom = 11;
          else if (latSpan > 0.1) zoom = 12;
        }
        setFlyTo({ lat: geo.lat, lng: geo.lng, zoom });
      } else if (data.length) {
        setFlyTo({ lat: data[0].lat, lng: data[0].lng, zoom: 13 });
      }
    } catch {}
    setLoading(false);
  }

  async function handleSelectStation(station) {
    setSelected(station);
    setHistory([]);
    setLoadingHistory(true);
    try {
      const h = await getStationHistory(station.id, fuel);
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

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.fuelTabs}>
          {FUELS.map(f => (
            <button
              key={f.key}
              className={`${styles.fuelTab} ${fuel === f.key ? styles.fuelTabActive : ''}`}
              onClick={() => setFuel(f.key)}
            >
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
        <MapContainer
          center={[46.1, 14.5]}
          zoom={9}
          className={styles.map}
          zoomControl={false}
          zoomSnap={0.25}
          zoomDelta={0.5}
          wheelPxPerZoomLevel={100}
          markerZoomAnimation
        >
          <TileLayer
            url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            maxZoom={20}
            keepBuffer={4}
            updateWhenZooming={false}
          />
          <MapController mapRef={mapRef} onBboxChange={fetchByBbox} />
          {flyTo && <FlyTo coords={flyTo} zoom={flyTo.zoom} onDone={() => setFlyTo(null)} />}

          {userPos && (
            <CircleMarker
              center={[userPos.lat, userPos.lng]}
              radius={8}
              pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 1 }}
            />
          )}

          <MarkerClusterGroup
            iconCreateFunction={createClusterIcon}
            chunkedLoading
            maxClusterRadius={60}
            disableClusteringAtZoom={15}
            showCoverageOnHover={false}
            spiderfyOnMaxZoom
          >
            {stations.map(s => (
              <Marker
                key={s.id}
                position={[s.lat, s.lng]}
                icon={createStationIcon(s.price)}
                eventHandlers={{ click: () => handleSelectStation(s) }}
              />
            ))}
          </MarkerClusterGroup>
        </MapContainer>

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
              <span className={styles.detailPriceBig} style={{ color: priceColor(selected.price) }}>
                {selected.price ? `€${selected.price.toFixed(3)}` : '—'}
              </span>
              {selected.distance != null && (
                <span className={styles.detailDistance}>{selected.distance} km away</span>
              )}
            </div>

            {selected.allPrices && Object.keys(selected.allPrices).length > 1 && (
              <div className={styles.allPrices}>
                {Object.entries(selected.allPrices)
                  .filter(([ft]) => ft !== fuel)
                  .map(([ft, p]) => (
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
                    <Tooltip
                      contentStyle={{ background: '#1e2130', border: '1px solid #2a2d3e', borderRadius: 8, color: '#e8eaf0', fontSize: 12 }}
                    />
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
