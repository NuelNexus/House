import { goUser } from "../lib/nav";

export default function ReviewCard({ review, index }) {
  return (
    <article className="card review-card">
      <div className="stars" aria-label={`${review.rating} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <i
            key={n}
            className={`${n <= review.rating ? "fa-solid" : "far"} fa-star`}
            aria-hidden="true"
          />
        ))}
      </div>
      <h3>{review.title}</h3>
      <span className="party-ref">
        <i className="fa-solid fa-location-dot" style={{ marginRight: 6, fontSize: 11 }} />
        {review.partyName}
      </span>
      <p className="comment">{review.comment}</p>
      <div className="author-row">
        <span className={`avatar ${index % 2 ? "rose" : ""}`}>
          {review.author.charAt(0).toUpperCase()}
        </span>
        <span className="who">
          {review.userId ? (
            <button className="author-link" onClick={() => goUser(review.userId)}>
              {review.author}
              {review.verified && (
                <i
                  className="fa-solid fa-circle-check"
                  style={{ color: "var(--rose-deep)", marginLeft: 8, fontSize: 13 }}
                  title="Verified attendee"
                />
              )}
            </button>
          ) : (
            <b>
              {review.author}
              {review.verified && (
                <i
                  className="fa-solid fa-circle-check"
                  style={{ color: "var(--rose-deep)", marginLeft: 8, fontSize: 13 }}
                  title="Verified attendee"
                />
              )}
            </b>
          )}
          <small>{review.date}</small>
        </span>
      </div>
    </article>
  );
}
