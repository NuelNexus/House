import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";

export default function CartDrawer({ setTab }) {
  const {
    cartOpen,
    setCartOpen,
    cartItems,
    total,
    updateQty,
    removeFromCart,
  } = useStore();
  const { ensureAuth } = useAuth();

  const goCheckout = () => {
    if (!ensureAuth("checkout")) return;
    setCartOpen(false);
    setTab("checkout");
  };

  return (
    <>
      <div
        className={`overlay ${cartOpen ? "show" : ""}`}
        onClick={() => setCartOpen(false)}
        aria-hidden="true"
      />
      <aside className={`drawer ${cartOpen ? "open" : ""}`} aria-hidden={!cartOpen}>
        <div className="drawer-head">
          <h3>
            Your Cart <span style={{ fontSize: 14, letterSpacing: 2 }}>({cartItems.length})</span>
          </h3>
          <button className="close-x" aria-label="Close cart" onClick={() => setCartOpen(false)}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="drawer-body">
          {cartItems.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-bag-shopping" />
              <h3>Cart is empty</h3>
              <p>Your party passes will live here.</p>
            </div>
          ) : (
            cartItems.map(({ ticket, qty }) => (
              <div className="cart-item" key={ticket.id}>
                <span className="ci-name">{ticket.name}</span>
                <span className="ci-price">{GH_CD(ticket.price * qty)}</span>
                <span className="ci-meta">
                  {ticket.date} · {ticket.location}
                </span>
                <div className="qty">
                  <button aria-label="Decrease" onClick={() => updateQty(ticket.id, qty - 1)}>
                    −
                  </button>
                  <span style={{ minWidth: 20, textAlign: "center" }}>{qty}</span>
                  <button aria-label="Increase" onClick={() => updateQty(ticket.id, qty + 1)}>
                    +
                  </button>
                </div>
                <button
                  className="ci-remove"
                  onClick={() => {
                    removeFromCart(ticket.id);
                  }}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <div className="drawer-foot">
          <div className="total-row">
            <span>Total</span>
            <span>{GH_CD(total)}</span>
          </div>
          <button className="btn" disabled={cartItems.length === 0} onClick={goCheckout}>
            Checkout <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </aside>
    </>
  );
}
