// ============================================================
// Ticket design presets — the styles hosts can pick from in the
// ticket generator. Each preset is a CSS class on the rendered
// ticket (.preset-<id>) plus a name/description for the picker.
// ============================================================

export const PRESETS = [
  {
    id: "classic",
    label: "Heritage Rail",
    description: "Cream paper, red & gold — the classic boarding pass.",
    icon: "fa-train-subway",
  },
  {
    id: "neon",
    label: "Midnight Neon",
    description: "Dark club glow with electric cyan & magenta.",
    icon: "fa-bolt",
  },
  {
    id: "minimal",
    label: "Studio White",
    description: "Clean white & black editorial type. Nothing else.",
    icon: "fa-circle-dot",
  },
  {
    id: "gold",
    label: "Black & Gold",
    description: "Luxury black with gold foil serifs and a velvet hand.",
    icon: "fa-crown",
  },
  {
    id: "tropical",
    label: "Poolside Punch",
    description: "Sunny gradient, bold rounded lettering.",
    icon: "fa-umbrella-beach",
  },
  {
    id: "noir",
    label: "Noir",
    description: "Grayscale industrial stencil. Moody and strict.",
    icon: "fa-user-secret",
  },
  {
    id: "carnival",
    label: "Carnival Rio",
    description: "Feathers, confetti & hot samba pink.",
    icon: "fa-masks-theater",
  },
  {
    id: "royal",
    label: "Royal Velvet",
    description: "Deep plum velvet with champagne serifs.",
    icon: "fa-gem",
  },
  {
    id: "sunset",
    label: "Sunset Glow",
    description: "Coral-to-gold gradient, soft and warm.",
    icon: "fa-sun",
  },
  {
    id: "cyber",
    label: "Cyber Grid",
    description: "Neon green wireframe on dark chrome.",
    icon: "fa-microchip",
  },
  {
    id: "retro",
    label: "Retro Arcade",
    description: "80s synthwave, chrome type, cassette stripes.",
    icon: "fa-gamepad",
  },
  {
    id: "coastal",
    label: "Coastal Blue",
    description: "Sea-glass teal, airy and breezy.",
    icon: "fa-water",
  },
];

// Fresh design used when a host first turns on the ticket designer.
// Field names map 1:1 onto the rendered ticket (see DesignedTicket).
export const DEFAULT_DESIGN = {
  enabled: true,
  preset: "classic",
  name: "",
  tagline: "First Class · Admission",
  depart: "",        // "From"
  arrive: "Main Gate", // "To / venue"
  gate: "VIP",       // the big "entry" block (like Platform 9¾)
  date: "",
  time: "",
  section: "GA",     // seat / section
  price: "0",        // door price shown on the ticket
  footnote: "Admission by ticket only. This pass is non-refundable.",
  bg: null,          // background image (URL or uploaded data-URL)
  stock: 100,        // how many tickets can be sold
  promo: null,       // { code: "EARLY10", pct: 10 } — optional discount
};

// True when a design carries a usable discount code.
export function promoOf(design) {
  const p = design && design.promo;
  if (!p || !p.code) return null;
  const pct = Math.max(0, Math.min(100, Number(p.pct) || 0));
  return pct > 0 ? { code: String(p.code).trim().toUpperCase(), pct } : null;
}


