import CoverArt from "./CoverArt";

// A party's cover: the photo the host/affiliate set when posting, or the
// illustrated CoverArt fallback when none was uploaded. Accepts either a
// full party row (coverUrl) or a loose object ({ coverUrl, category }).
export default function PartyCover({ party, className = "" }) {
  const url = party?.coverUrl || party?.cover || null;
  if (url) {
    return (
      <img
        className={`cover-art cover-img ${className}`}
        src={url}
        alt=""
        loading="lazy"
      />
    );
  }
  return <CoverArt category={party?.category} className={className} />;
}
