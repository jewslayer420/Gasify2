'use client';

// Top-down "your location" marker — a stylised, wide-hipped sports-sedan
// silhouette (not any real manufacturer's design), rotated to the user's
// heading. The same convention driving-nav apps use instead of a plain dot,
// since a car only communicates direction of travel when seen from above.
export default function CarMarker({ size = 30, rotation = 0 }) {
  const h = Math.round(size * (60 / 32));
  return (
    <div
      style={{
        width: size,
        height: h,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: '50% 50%',
        transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'transform',
      }}
    >
      <svg width={size} height={h} viewBox="0 0 32 60" style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))', display: 'block' }}>
        <path
          d="M16,3 C21,3 25,7 25.5,10 C26.5,14 28,15 28,18 C28,22 27,26 26.5,29 C27.5,33 27.5,41 27,44 C26.5,48 25,52 22,55 C19.5,57 17.5,57.5 16,57.5 C14.5,57.5 12.5,57 10,55 C7,52 5.5,48 5,44 C4.5,41 4.5,33 5.5,29 C5,26 4,22 4,18 C4,15 5.5,14 6.5,10 C7,7 11,3 16,3 Z"
          fill="#1D3461"
          stroke="#FFFFFF"
          strokeWidth="1.4"
        />
        {/* windshield */}
        <polygon points="8,14 24,14 21.5,21 10.5,21" fill="#B8D4F0" opacity="0.92" />
        {/* roof */}
        <rect x="9.5" y="21" width="13" height="15" rx="3" fill="#24447F" />
        {/* rear window */}
        <polygon points="9.5,36 22.5,36 20.5,43 11.5,43" fill="#B8D4F0" opacity="0.85" />
        {/* mirrors */}
        <rect x="1.3" y="18" width="3.4" height="2.4" rx="1" fill="#12203D" />
        <rect x="27.3" y="18" width="3.4" height="2.4" rx="1" fill="#12203D" />
        {/* exhaust tips */}
        <circle cx="12" cy="56.5" r="1.3" fill="#333333" />
        <circle cx="20" cy="56.5" r="1.3" fill="#333333" />
      </svg>
    </div>
  );
}
