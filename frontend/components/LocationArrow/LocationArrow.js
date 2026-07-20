'use client';

// Current-location marker: a simple rotating arrow, the same convention
// Google/Apple Maps use, pointing in the direction of travel.
export default function LocationArrow({ size = 26, rotation = 0 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: '50% 50%',
        transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'transform',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.45))', display: 'block' }}>
        <path
          d="M12,2 L21,21 L12,16.5 L3,21 Z"
          fill="#3B82F6"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
