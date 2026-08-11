import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// The party scene is Ghana, so the map opens on Accra.
const ACCRA = [5.6037, -0.187];

// A short, card-friendly address: drop the country and keep the
// nearest bits ("East Legon, Accra, Greater Accra Region").
function shortName(display) {
  return (display || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/ghana|republic of ghana/i.test(s))
    .slice(0, 3)
    .join(", ");
}

// Reverse geocode a point → street/place name (OpenStreetMap Nominatim).
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`
    );
    const data = await res.json();
    return data?.display_name || "";
  } catch {
    return "";
  }
}

// A CSS pin instead of Leaflet's bundled PNG icons (whose asset paths
// break under bundlers). Styled in global.css under .loc-pin.
const pinIcon = () =>
  L.divIcon({
    className: "loc-pin-wrap",
    html: '<div class="loc-pin"></div>',
    iconSize: [28, 40],
    iconAnchor: [14, 38],
  });

// Map-based location picker. `value` = { lat, lng, name }; `onChange`
// fires with { lat, lng, name } whenever a spot is picked (map click,
// search result, or "use my location").
export default function LocationPicker({ value, onChange }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  // onChange lives in a ref so the one-time map init never re-runs.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  // Create the map once (StrictMode-safe: cleanup tears it down).
  useEffect(() => {
    if (mapRef.current || !elRef.current) return undefined;
    const map = L.map(elRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    }).setView(ACCRA, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    const marker = L.marker(ACCRA, { icon: pinIcon() }).addTo(map);
    map.on("click", (e) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      reverseGeocode(lat, lng).then((name) =>
        onChangeRef.current({ lat, lng, name: shortName(name) })
      );
    });
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Reflect an externally-supplied point without stealing the user's
  // zoom — pan over, and only move the marker when it actually changed.
  useEffect(() => {
    if (!mapRef.current || !value) return;
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const cur = markerRef.current?.getLatLng?.();
    if (
      cur &&
      Math.abs(cur.lat - lat) < 1e-6 &&
      Math.abs(cur.lng - lng) < 1e-6
    ) {
      return;
    }
    mapRef.current.panTo([lat, lng]);
    markerRef.current?.setLatLng([lat, lng]);
  }, [value?.lat, value?.lng]);

  // Debounced place search (Nominatim, Ghana-first).
  useEffect(() => {
    const q = search.trim();
    if (q.length < 3) {
      setResults([]);
      return undefined;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          q
        )}&limit=5&countrycodes=gh`
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => setResults(Array.isArray(list) ? list : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 400);
    return () => window.clearTimeout(t);
  }, [search]);

  const pickPlace = (place) => {
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    setResults([]);
    setSearch("");
    mapRef.current?.flyTo([lat, lng], 15);
    markerRef.current?.setLatLng([lat, lng]);
    onChangeRef.current({ lat, lng, name: shortName(place.display_name) });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        mapRef.current?.flyTo([lat, lng], 15);
        markerRef.current?.setLatLng([lat, lng]);
        const name = await reverseGeocode(lat, lng);
        onChangeRef.current({ lat, lng, name: shortName(name) });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="location-picker">
      <div className="loc-tools">
        <div className="loc-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            className="input"
            placeholder="Search a place… (e.g. East Legon)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // Enter would otherwise submit the party form.
              if (e.key === "Enter") e.preventDefault();
            }}
            aria-label="Search for a place"
          />
          {searching && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? (
            <>
              <i className="fa-solid fa-spinner fa-spin icon" /> Locating…
            </>
          ) : (
            <>
              <i className="fa-solid fa-location-crosshairs icon" /> Use my location
            </>
          )}
        </button>
      </div>

      {results.length > 0 && (
        <ul className="loc-results">
          {results.map((r) => (
            <li key={r.place_id}>
              <button type="button" onClick={() => pickPlace(r)}>
                <i className="fa-solid fa-location-dot" aria-hidden="true" />
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="loc-map" ref={elRef} aria-label="Map — tap to set the location" />

      <p className="loc-hint">
        <i className="fa-solid fa-hand-pointer" aria-hidden="true" /> Tap the map to
        drop the pin — the address fills into the field above automatically.
      </p>
    </div>
  );
}
