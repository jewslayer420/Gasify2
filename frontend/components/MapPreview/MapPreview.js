'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Map, { Marker, AttributionControl, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { COUNTRY_CENTROIDS } from '../../lib/countryCentroids';
import styles from './MapPreview.module.css';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/basic-v2-dark/style.json?key=${MAPTILER_KEY}`
  : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Approximate footprint of one chip in screen px, used for decluttering
const CHIP_W = 86;
const CHIP_H = 34;

// Web-mercator screen position at a given zoom (world px, tile size 512)
function project(lng, lat, zoom) {
  const scale = 512 * Math.pow(2, zoom);
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  };
}

export default function MapPreview() {
  const [chips, setChips] = useState([]);
  const [zoom, setZoom] = useState(3.4);

  useEffect(() => {
    fetch('/api/stations/country-meta?fuel=diesel')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setChips(
        d.filter(m => COUNTRY_CENTROIDS[m.country] && m.median != null)
          .map(m => ({ ...m, ...COUNTRY_CENTROIDS[m.country] }))
          .sort((a, b) => (b.stations || 0) - (a.stations || 0))
      ))
      .catch(() => {});
  }, []);

  // At any zoom, keep the highest-coverage chip in each contested spot;
  // zooming in spreads countries apart and reveals the rest.
  const visible = useMemo(() => {
    const placed = [];
    const out = [];
    for (const c of chips) {
      const p = project(c.lng, c.lat, zoom);
      if (placed.some(q => Math.abs(q.x - p.x) < CHIP_W && Math.abs(q.y - p.y) < CHIP_H)) continue;
      placed.push(p);
      out.push(c);
    }
    return out;
  }, [chips, zoom]);

  return (
    <div className={styles.window}>
      <div className={styles.chrome}>
        <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
        <span className={styles.url}>gasify.app/map</span>
      </div>
      <div className={styles.mapBox}>
        <Map
          initialViewState={{ longitude: 9, latitude: 48.5, zoom: 3.4 }}
          mapStyle={MAP_STYLE}
          minZoom={1.3}
          maxZoom={9}
          dragRotate={false}
          touchPitch={false}
          cooperativeGestures
          attributionControl={false}
          onMove={e => setZoom(e.viewState.zoom)}
          style={{ position: 'absolute', inset: 0 }}
        >
          <NavigationControl position="top-left" showCompass={false} />
          <AttributionControl compact customAttribution={[
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            '© <a href="https://www.maptiler.com/copyright/">MapTiler</a>',
          ]} />
          {visible.map(c => (
            <Marker key={c.country} longitude={c.lng} latitude={c.lat} anchor="center">
              <div className={styles.chip}>
                <span className={styles.chipCc}>{c.country}</span>
                <span className={styles.chipPrice}>€{c.median.toFixed(2)}</span>
              </div>
            </Marker>
          ))}
        </Map>
        <Link href="/map" className={styles.openBtn}>Open the map</Link>
      </div>
    </div>
  );
}
