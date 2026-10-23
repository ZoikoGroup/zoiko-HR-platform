import test from "node:test";
import assert from "node:assert/strict";
import { offerSendReason } from "../src/modules/zoiko-hr/recruitment/offers.jsx";

test("an organization-waived L1 offer letter can be sent while its document is still a rendered draft", () => {
  assert.equal(offerSendReason({
    issued: false,
    closed: false,
    letterStatus: "RENDERED_DRAFT",
    waived: true,
    letter: { approval_policy: "L1" },
    offerStatus: "approved",
  }), "");
});

test("a rendered draft without an approval waiver still requires approval", () => {
  assert.match(offerSendReason({
    issued: false,
    closed: false,
    letterStatus: "RENDERED_DRAFT",
    waived: false,
    letter: { approval_policy: "L2" },
    offerStatus: "approved",
  }), /finish its approvals first/);
});

test("approved letters remain sendable and closed offers do not", () => {
  assert.equal(offerSendReason({ issued: false, closed: false, letterStatus: "HUMAN_APPROVED", waived: false, letter: {}, offerStatus: "approved" }), "");
  assert.equal(offerSendReason({ issued: false, closed: true, closedLabel: "accepted", letterStatus: "HUMAN_APPROVED", waived: false, letter: {}, offerStatus: "accepted" }), "This offer is accepted.");
});
