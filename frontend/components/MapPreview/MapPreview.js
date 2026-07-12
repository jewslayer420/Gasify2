'use client';
import { useEffect, useState } from 'react';
import Map, { Marker, AttributionControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import styles from './MapPreview.module.css';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/basic-v2-dark/style.json?key=${MAPTILER_KEY}`
  : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// A handful of European anchors for the live price chips
const SPOTS = {
  FR: { lng: 2.35, lat: 46.6 },
  DE: { lng: 10.45, lat: 51.17 },
  ES: { lng: -3.7, lat: 40.0 },
  IT: { lng: 12.57, lat: 42.5 },
  PL: { lng: 19.5, lat: 52.1 },
  TR: { lng: 32.9, lat: 39.5 },
  GB: { lng: -1.5, lat: 53.0 },
  SE: { lng: 15.0, lat: 59.0 },
};

export default function MapPreview() {
  const [chips, setChips] = useState([]);

  useEffect(() => {
    fetch('/api/stations/country-meta?fuel=diesel')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setChips(
        d.filter(m => SPOTS[m.country] && m.median != null)
          .map(m => ({ ...m, ...SPOTS[m.country] }))
      ))
      .catch(() => {});
  }, []);

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
          interactive={false}
          attributionControl={false}
          style={{ position: 'absolute', inset: 0 }}
        >
          <AttributionControl compact customAttribution={[
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            '© <a href="https://www.maptiler.com/copyright/">MapTiler</a>',
          ]} />
          {chips.map(c => (
            <Marker key={c.country} longitude={c.lng} latitude={c.lat} anchor="center">
              <div className={styles.chip}>
                <span className={styles.chipCc}>{c.country}</span>
                <span className={styles.chipPrice}>€{c.median.toFixed(2)}</span>
              </div>
            </Marker>
          ))}
        </Map>
      </div>
    </div>
  );
}
