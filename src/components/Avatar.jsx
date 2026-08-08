import { useId } from "react";

export const AVATAR_PALETTES = [
  ["#ff9a9e", "#f6d3d8"], // rose
  ["#a18cd1", "#d7c6ec"], // violet
  ["#7ec8a3", "#bfe6d0"], // mint
  ["#ffd98a", "#ffc3a0"], // gold
  ["#8fa8d9", "#c3d0ec"], // indigo
];

export default function Avatar({ name, seed = 0, size = 96, src = null }) {
  const uid = useId();
  const idx = Math.abs(seed) % AVATAR_PALETTES.length;
  const [a, b] = AVATAR_PALETTES[idx];
  const initial = (name || "G").charAt(0).toUpperCase();
  const gid = `avg-${uid}`;

  if (src) {
    return (
      <img
        className="avatar-svg avatar-img"
        src={src}
        alt={`${name || "Guest"} avatar`}
        width={size}
        height={size}
        loading="lazy"
      />
    );
  }

  return (
    <svg
      className="avatar-svg"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${name || "Guest"} avatar`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#${gid})`} />
      <circle cx="50" cy="40" r="17" fill="rgba(255,255,255,0.88)" />
      <path
        d="M19 94 Q28 60 50 60 Q72 60 81 94 Z"
        fill="rgba(255,255,255,0.88)"
      />
      <text
        x="50"
        y="61"
        textAnchor="middle"
        fontSize="30"
        fontWeight="700"
        fill="#101117"
        fontFamily="Oswald, sans-serif"
      >
        {initial}
      </text>
    </svg>
  );
}
