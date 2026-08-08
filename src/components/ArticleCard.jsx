import CoverArt from "./CoverArt";

function Cover({ article, image, children }) {
  return (
    <div
      className={`cover ${image ? "has-img" : ""}`}
      style={{
        background: image ? undefined : `linear-gradient(135deg, ${article.accent}, #101117)`,
      }}
      aria-hidden="true"
    >
      {image ? <img src={image} alt="" loading="lazy" /> : <CoverArt category={article.category} />}
      {children}
    </div>
  );
}

export default function ArticleCard({
  article,
  onOpen,
  featured = false,
  image,
  external = false,
  postedByYou = false,
}) {
  const yours = postedByYou && (
    <span className="tag yours">
      <i className="fa-solid fa-feather" /> Posted by you
    </span>
  );


  if (featured) {
    const inner = (
      <>
        <Cover article={article} image={image}>
          {image && <span className="tag live-tag">Live</span>}
        </Cover>
        <div className="body">
          <span className="tag">{article.category}</span>
          {yours}
          <h2>{article.title}</h2>
          <p>{article.excerpt}</p>
          <div className="meta-row">
            <span>{article.date}</span>
            <span>{article.readTime}</span>
            <span>{external ? "Open article →" : "Read →"}</span>
          </div>
        </div>
      </>
    );

    return external ? (
      <a className="featured" href={article.url} target="_blank" rel="noreferrer">
        {inner}
      </a>
    ) : (
      <article className="featured" onClick={() => onOpen(article)} style={{ cursor: "pointer" }}>
        {inner}
      </article>
    );
  }

  const body = (
    <>
      <Cover article={article} image={image}>
        {image && <span className="tag live-tag">Live</span>}
        {!image && <span className="tag">{article.category}</span>}
      </Cover>
      <h3>
        {article.title}
        {yours}
      </h3>
      <p className="excerpt">{article.excerpt}</p>
      <div className="meta-row">
        <span>{article.date}</span>
        {external ? (
          <span className="read">Open <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: 11 }} /></span>
        ) : (
          <button className="read" onClick={() => onOpen(article)} style={{ background: "transparent" }}>
            Read <i className="fa-solid fa-arrow-right" style={{ fontSize: 11 }} />
          </button>
        )}
      </div>
    </>
  );

  return external ? (
    <a className="card article-card" href={article.url} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <article className="card article-card">{body}</article>
  );
}
