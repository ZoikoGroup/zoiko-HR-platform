import OfferManagement from "./offers.jsx";

/** Recruitment → Offers Issued: every offer whose letter was sent, on the Offer Management screen. */
export default function OffersIssued() {
  return <OfferManagement mode="issued" />;
}
