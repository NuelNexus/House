import { GH_CD } from "../data/seed";

export default function TicketStub({ ticket }) {
  return (
    <div className="ticket-stub">
      <div className="stub-top">
        <b>{ticket.name}</b>
        <span className="code">{ticket.code}</span>
      </div>
      <div className="stub-mid">
        <span className="info">
          {ticket.date}
          <br />
          {ticket.location}
          <br />
          <b>{GH_CD(ticket.price)}</b>
        </span>
        <span className="barcode" aria-hidden="true" />
      </div>
    </div>
  );
}
