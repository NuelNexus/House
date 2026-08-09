import Modal from "./Modal";
import PartyCard from "./PartyCard";
import ReviewCard from "./ReviewCard";
import TicketStub from "./TicketStub";
import DesignedTicket from "./DesignedTicket";
import CoverArt from "./CoverArt";
import { useStore } from "../context/StoreContext";
import { GH_CD } from "../data/seed";

export default function ProfileItemModal({ item, onClose, deletable = false }) {
  const { deleteParty, deleteReview, deleteTicket } = useStore();

  const handleDelete = () => {
    if (item.kind === "party") deleteParty(item.id);
    else if (item.kind === "review") deleteReview(item.id);
    else deleteTicket(item.id);
    onClose();
  };

  const footer = (
    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
      {deletable && (
        <button
          className="btn btn-danger"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={handleDelete}
        >
          <i className="fa-solid fa-trash-can icon" /> Delete
        </button>
      )}
      <button
        className="btn btn-outline"
        style={{ flex: 1, justifyContent: "center" }}
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );

  if (item.kind === "party") {
    return (
      <Modal title={item.label} onClose={onClose}>
        <PartyCard party={item.ref} />
        {footer}
      </Modal>
    );
  }

  if (item.kind === "review") {
    return (
      <Modal title={item.label} onClose={onClose}>
        <ReviewCard review={item.ref} index={0} />
        {footer}
      </Modal>
    );
  }

  // ticket
  const holderName =
    typeof item.ref.holder === "object" ? item.ref.holder.name : item.ref.holder;

  return (
    <Modal title="Your Pass" onClose={onClose}>
      <div className="art-cover" style={{ background: "linear-gradient(135deg, #c7a5a5, #101117)" }}>
        <CoverArt category={item.coverCat} />
      </div>
      <div style={{ marginTop: 20 }}>
        {item.ref.design ? (
          <DesignedTicket
            design={item.ref.design}
            passenger={holderName || "You"}
            code={item.ref.code}
            hash={item.ref.hash}
            price={item.ref.price}
          />
        ) : (
          <TicketStub ticket={item.ref} />
        )}
      </div>
      <p
        style={{
          marginTop: 16,
          fontSize: 13,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: "var(--ink-soft)",
        }}
      >
        Holder · {holderName || "You"} — {GH_CD(item.ref.price)} · Show this at the door.
      </p>
      {footer}
    </Modal>
  );
}
