function variantFor(category) {
  const c = (category || "").toLowerCase();
  if (c.includes("rooftop")) return "rooftop";
  if (c.includes("pool")) return "pool";
  if (c.includes("villa")) return "villa";
  if (c.includes("travel") || c.includes("kwahu") || c.includes("beach")) return "beach";
  if (c.includes("vip")) return "vip";
  if (c.includes("kickback") || c.includes("games") || c.includes("sofa")) return "livingroom";
  if (c.includes("birthday") || c.includes("cake")) return "birthday";
  if (c.includes("guide") || c.includes("book")) return "guide";
  if (c.includes("music") || c.includes("rave") || c.includes("playlist") || c.includes("sound")) return "sound";
  if (c.includes("scene") || c.includes("news") || c.includes("lifestyle") || c.includes("culture")) return "press";
  return "confetti";
}

const sky = (a, b) => `linear-gradient(180deg, ${a} 0%, ${b} 100%)`;

function Scene({ variant }) {
  switch (variant) {
    case "rooftop":
      return (
        <g>
          <rect width="400" height="220" fill={sky("#f6c1c8", "#e8edf8")} />
          <circle cx="320" cy="52" r="26" fill="#ffd98a" />
          <g fill="#101117" opacity="0.16">
            <rect x="20" y="110" width="52" height="60" />
            <rect x="86" y="130" width="40" height="40" />
            <rect x="140" y="100" width="60" height="70" />
            <rect x="214" y="128" width="44" height="42" />
            <rect x="272" y="106" width="56" height="64" />
            <rect x="342" y="132" width="40" height="38" />
          </g>
          <rect x="0" y="168" width="400" height="14" fill="#101117" opacity="0.85" />
          <rect x="0" y="182" width="400" height="38" fill="#101117" opacity="0.5" />
          <g stroke="#101117" strokeWidth="3">
            <line x1="40" y1="168" x2="40" y2="96" />
            <line x1="360" y1="168" x2="360" y2="96" />
            <line x1="40" y1="96" x2="360" y2="96" />
          </g>
          <g fill="#fff" opacity="0.85">
            <rect x="58" y="104" width="42" height="64" rx="3" />
            <rect x="300" y="104" width="42" height="64" rx="3" />
          </g>
          <g stroke="#101117" strokeWidth="2.5" fill="none">
            <circle cx="128" cy="118" r="5" />
            <circle cx="272" cy="118" r="5" />
          </g>
        </g>
      );
    case "pool":
      return (
        <g>
          <rect width="400" height="220" fill={sky("#bcddf7", "#e8edf8")} />
          <circle cx="86" cy="60" r="30" fill="#ffe08a" />
          <rect y="118" width="400" height="102" fill="#3f8fbf" />
          <rect y="118" width="400" height="12" fill="#59b7e6" />
          <path d="M0 152 q30 -12 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t40 0 v68 H0 Z" fill="#2f739c" opacity="0.55" />
          <g fill="none" stroke="#fff" strokeWidth="8" opacity="0.85">
            <ellipse cx="240" cy="140" rx="52" ry="30" />
            <ellipse cx="240" cy="140" rx="26" ry="15" />
          </g>
          <rect x="12" y="150" width="74" height="58" fill="#101117" opacity="0.85" rx="4" />
          <rect x="22" y="160" width="54" height="20" fill="#7ec3e8" opacity="0.9" />
          <rect x="22" y="184" width="38" height="6" fill="#fff" opacity="0.7" />
          <rect x="22" y="194" width="54" height="6" fill="#fff" opacity="0.5" />
        </g>
      );
    case "villa":
      return (
        <g>
          <rect width="400" height="220" fill={sky("#f9d9c4", "#f3ede2")} />
          <circle cx="300" cy="58" r="28" fill="#ffdf8f" />
          <g fill="#101117" opacity="0.9">
            <rect x="120" y="96" width="150" height="92" />
            <rect x="150" y="74" width="90" height="30" />
            <rect x="140" y="138" width="40" height="50" fill="#fff7ec" />
            <rect x="210" y="138" width="40" height="50" fill="#f2b8a0" />
          </g>
          <rect x="110" y="188" width="180" height="10" fill="#101117" opacity="0.6" />
          <path d="M300 116 l52 14 -12 8 -52 -14 Z" fill="#2f6b3a" />
          <g stroke="#2f6b3a" strokeWidth="5" strokeLinecap="round">
            <path d="M330 120 q-10 -22 2 -36" />
            <path d="M352 124 q-14 -28 -4 -46" />
          </g>
          <g fill="#2f6b3a" opacity="0.8">
            <path d="M318 84 q6 -12 14 -12 q-4 10 -14 12 Z" />
            <path d="M342 76 q8 -14 18 -14 q-6 12 -18 14 Z" />
          </g>
        </g>
      );
    case "beach":
      return (
        <g>
          <rect width="400" height="220" fill={sky("#ffd9a0", "#ffb4a2")} />
          <circle cx="200" cy="70" r="34" fill="#ffec9e" />
          <rect y="140" width="400" height="80" fill="#eacba1" />
          <path d="M0 140 q100 18 200 6 t200 -4 v78 H0 Z" fill="#2f8fbf" opacity="0.9" />
          <g stroke="#fff" strokeWidth="4" opacity="0.7" strokeLinecap="round">
            <path d="M20 156 q18 -10 36 0" />
            <path d="M60 168 q18 -10 36 0" />
          </g>
          <path d="M316 96 q14 -42 2 -66" stroke="#2f6b3a" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M316 96 q-26 -12 -44 -4 q30 4 44 4 Z" fill="#2f6b3a" />
          <path d="M322 66 q-22 -8 -36 -2 q24 2 36 2 Z" fill="#2f6b3a" />
          <path d="M60 108 q26 10 44 2 q-28 -2 -44 -2 Z" fill="#101117" opacity="0.5" />
          <path d="M60 108 q10 16 2 30" stroke="#101117" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.5" />
          <g fill="#fff" opacity="0.9">
            <circle cx="250" cy="188" r="7" />
            <circle cx="340" cy="196" r="5" />
            <circle cx="120" cy="192" r="6" />
          </g>
        </g>
      );
    case "vip":
      return (
        <g>
          <rect width="400" height="220" fill={sky("#1c1d2e", "#3a3b55")} />
          <g fill="#fff">
            <circle cx="60" cy="40" r="2" />
            <circle cx="150" cy="70" r="1.6" />
            <circle cx="330" cy="34" r="2" />
            <circle cx="250" cy="90" r="1.4" />
            <circle cx="380" cy="80" r="1.8" />
            <circle cx="100" cy="110" r="1.4" />
          </g>
          <circle cx="330" cy="60" r="20" fill="#ffe08a" opacity="0.9" />
          <g fill="#0e0f18">
            <rect x="30" y="120" width="50" height="70" />
            <rect x="94" y="140" width="40" height="50" />
            <rect x="150" y="112" width="60" height="78" />
            <rect x="226" y="136" width="44" height="54" />
            <rect x="286" y="118" width="54" height="72" />
            <rect x="354" y="142" width="36" height="48" />
          </g>
          <g fill="#ffd98a">
            <rect x="40" y="126" width="6" height="10" />
            <rect x="160" y="118" width="6" height="10" />
            <rect x="296" y="124" width="6" height="10" />
            <rect x="334" y="126" width="6" height="10" />
          </g>
          <path d="M200 210 L200 118" stroke="#ff5f7a" strokeWidth="6" opacity="0.9" />
          <path d="M176 128 L200 102 L224 128 Z" fill="#ff5f7a" opacity="0.9" />
        </g>
      );
    case "livingroom":
      return (
        <g>
          <rect width="400" height="220" fill={sky("#efe3f5", "#e8edf8")} />
          <rect x="40" y="70" width="320" height="120" fill="#101117" opacity="0.85" rx="4" />
          <rect x="40" y="70" width="320" height="22" fill="#101117" opacity="0.65" />
          <g fill="#2b2c38">
            <rect x="64" y="108" width="120" height="52" rx="18" />
            <rect x="200" y="108" width="120" height="52" rx="18" />
          </g>
          <rect x="64" y="128" width="120" height="8" fill="#6b6c7e" />
          <rect x="200" y="128" width="120" height="8" fill="#6b6c7e" />
          <rect x="84" y="160" width="16" height="30" fill="#2b2c38" />
          <rect x="236" y="160" width="16" height="30" fill="#2b2c38" />
          <circle cx="336" cy="92" r="22" fill="#ffd98a" />
          <rect x="326" y="114" width="20" height="44" fill="#101117" opacity="0.8" />
          <path d="M316 158 h40 l-8 18 h-24 Z" fill="#101117" opacity="0.6" />
          <path d="M60 196 q14 -18 30 -18 t30 18 Z" fill="#2f6b3a" />
          <path d="M60 196 q14 -18 30 -18 t30 18 Z" fill="none" stroke="#101117" strokeWidth="3" opacity="0.3" />
          <g stroke="#ff5f7a" strokeWidth="5" strokeLinecap="round" opacity="0.85">
            <path d="M96 78 q16 -16 8 -34" />
            <path d="M116 80 q14 -22 2 -40" />
          </g>
          <circle cx="106" cy="40" r="10" fill="#ff5f7a" opacity="0.7" />
          <circle cx="126" cy="36" r="10" fill="#ff5f7a" opacity="0.45" />
        </g>
      );
    case "sound":
      return (
        <g>
          <rect width="400" height="220" fill={sky("#2b2438", "#4a3a5e")} />
          <g fill="#17131f">
            <rect x="70" y="60" width="90" height="130" rx="10" />
            <rect x="240" y="60" width="90" height="130" rx="10" />
          </g>
          <g fill="#6b5a8a">
            <circle cx="115" cy="90" r="26" />
            <circle cx="115" cy="150" r="26" />
            <circle cx="285" cy="90" r="26" />
            <circle cx="285" cy="150" r="26" />
          </g>
          <circle cx="115" cy="90" r="8" fill="#ff5f7a" />
          <circle cx="115" cy="150" r="8" fill="#ff5f7a" />
          <circle cx="285" cy="90" r="8" fill="#ff5f7a" />
          <circle cx="285" cy="150" r="8" fill="#ff5f7a" />
          <path d="M330 96 q8 -6 0 -14 q10 4 10 14 q0 10 -10 14 q8 -6 0 -14 Z" fill="#ffd98a" />
          <path d="M344 92 q7 -5 0 -12 q9 3 9 12 q0 9 -9 12 q7 -5 0 -12 Z" fill="#ffd98a" opacity="0.7" />
          <g>
            {[0, 1, 2, 3, 4].map((i) => (
              <rect key={i} x={340 - i * 7} y={180 - (i % 2 === 0 ? 46 : 30)} width="5" height={i % 2 === 0 ? 46 : 30} fill="#ff5f7a" opacity={0.85 - i * 0.13} />
            ))}
          </g>
        </g>
      );
    case "birthday":
      return (
        <g>
          <rect width="400" height="220" fill={sky("#f8d7e8", "#efe3f5")} />
          <g stroke="#101117" strokeWidth="4" strokeLinecap="round">
            <line x1="150" y1="196" x2="150" y2="110" />
            <line x1="250" y1="196" x2="250" y2="110" />
          </g>
          <path d="M118 128 h164 l-12 68 h-140 Z" fill="#ffd9a0" />
          <path d="M118 128 h164 l-4 22 h-156 Z" fill="#ffb4a2" />
          <rect x="150" y="78" width="100" height="22" fill="#ff5f7a" rx="4" />
          <g fill="#ffd98a">
            <path d="M200 48 q6 -18 16 -18 q-8 12 -16 18 Z" />
            <path d="M226 56 q6 -16 15 -16 q-7 10 -15 16 Z" />
            <path d="M172 58 q6 -16 15 -16 q-7 10 -15 16 Z" />
          </g>
          <g fill="#ff5f7a" opacity="0.85">
            <circle cx="140" cy="52" r="8" />
            <circle cx="258" cy="64" r="6" />
            <circle cx="286" cy="44" r="7" />
          </g>
          <rect x="150" y="146" width="100" height="8" fill="#ff5f7a" opacity="0.7" />
          <g fill="#101117" opacity="0.6">
            <circle cx="168" cy="170" r="4" />
            <circle cx="188" cy="170" r="4" />
            <circle cx="208" cy="170" r="4" />
            <circle cx="228" cy="170" r="4" />
          </g>
        </g>
      );
    case "guide":
      return (
        <g>
          <rect width="400" height="220" fill={sky("#e8eef8", "#f5f2ea")} />
          <g fill="#101117" opacity="0.9">
            <rect x="90" y="44" width="220" height="140" rx="6" />
            <rect x="104" y="58" width="192" height="112" fill="#fffdf5" />
          </g>
          <rect x="104" y="58" width="192" height="14" fill="#c9a5b5" />
          <g fill="#b9bcc9">
            <rect x="120" y="84" width="70" height="8" />
            <rect x="120" y="102" width="120" height="8" />
            <rect x="120" y="120" width="90" height="8" />
            <rect x="120" y="138" width="140" height="8" />
          </g>
          <g fill="#ff5f7a" opacity="0.9">
            <rect x="120" y="86" width="8" height="4" />
            <rect x="120" y="104" width="8" height="4" />
            <rect x="120" y="122" width="8" height="4" />
            <rect x="120" y="140" width="8" height="4" />
          </g>
          <circle cx="310" cy="60" r="16" fill="#ffd98a" />
          <path d="M94 44 l10 10 M306 44 l10 -10 M94 184 l10 -10 M306 184 l10 10" stroke="#101117" strokeWidth="3" opacity="0.4" />
        </g>
      );
    case "press":
      return (
        <g>
          <rect width="400" height="220" fill={sky("#f0e9f8", "#e8edf8")} />
          <rect x="60" y="40" width="280" height="150" fill="#fff" stroke="#101117" strokeWidth="3" />
          <rect x="80" y="58" width="120" height="18" fill="#101117" />
          <rect x="80" y="86" width="200" height="10" fill="#b9bcc9" />
          <rect x="80" y="102" width="180" height="10" fill="#b9bcc9" />
          <rect x="80" y="118" width="210" height="10" fill="#b9bcc9" />
          <rect x="80" y="134" width="160" height="10" fill="#b9bcc9" />
          <rect x="80" y="158" width="120" height="16" fill="#ff5f7a" opacity="0.85" />
          <g fill="#ffd98a">
            <circle cx="288" cy="150" r="12" />
            <circle cx="300" cy="138" r="12" />
          </g>
          <path d="M288 150 l14 -14" stroke="#101117" strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    default:
      return (
        <g>
          <rect width="400" height="220" fill={sky("#f3e9f7", "#e8edf8")} />
          <g fill="#101117" opacity="0.85">
            <circle cx="110" cy="80" r="22" />
            <rect x="250" y="52" width="26" height="26" transform="rotate(45 263 65)" />
            <circle cx="320" cy="150" r="14" />
          </g>
          <g fill="#ff5f7a" opacity="0.85">
            <rect x="150" y="150" width="26" height="26" transform="rotate(45 163 163)" />
            <circle cx="200" cy="60" r="12" />
          </g>
          <g fill="#ffd98a" opacity="0.95">
            <circle cx="90" cy="160" r="10" />
            <rect x="300" y="96" width="18" height="18" transform="rotate(45 309 105)" />
          </g>
        </g>
      );
  }
}

export default function CoverArt({ category, className = "" }) {
  const variant = variantFor(category);
  return (
    <svg
      className={`cover-art ${className}`}
      viewBox="0 0 400 220"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${category || "event"} illustration`}
    >
      <Scene variant={variant} />
    </svg>
  );
}
