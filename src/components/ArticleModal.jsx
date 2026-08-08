import { useEffect } from "react";
import CoverArt from "./CoverArt";

export default function ArticleModal({ article, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="overlay show article-modal" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="art-cover"
          style={{ background: `linear-gradient(135deg, ${article.accent}, #101117)` }}
        >
          <CoverArt category={article.category} />
        </div>
        <div className="art-head">
          <span className="tag">{article.category}</span>
          <h2>{article.title}</h2>
          <div className="meta-row">
            <span>{article.date}</span>
            <span>{article.author}</span>
            <span>{article.readTime}</span>
          </div>
        </div>
        <div className="art-body">
          {(
            Array.isArray(article.body)
              ? article.body
              : String(article.body || "")
                  .split(/\n{2,}/)
                  .map((p) => p.trim())
                  .filter(Boolean)
          ).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {!Array.isArray(article.body) && !article.body && article.excerpt && (
            <p>{article.excerpt}</p>
          )}
        </div>
        <div style={{ padding: "0 30px 34px", display: "flex", gap: 10 }}>
          <button className="btn btn-outline" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
