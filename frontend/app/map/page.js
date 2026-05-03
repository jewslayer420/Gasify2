'use client';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div style={{ height: '100dvh', background: '#0f1117' }} /> });

export default function MapPage() {
  return <MapView />;
}
