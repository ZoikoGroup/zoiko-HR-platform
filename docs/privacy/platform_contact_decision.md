# What the platform may know about a tenant's administrator

Decision (recorded for ZHR-PRIV-001 E01): the platform needs to be able to say which administrator account it is looking at and to reach that account's mailbox through the product (a reset link, an invitation). It does not need the person's name or address.

- The platform sees an organization administrator as a **pseudonymous reference** (`Org Admin #a3f9`: a keyed hash of the account id, stable, not reversible without the server key) and a **masked address** (`j*******@acme.com`).
- Reset links and invitations go to the real address from the server; the platform never receives it.
- The organization's registered e-mail is masked the same way; its tax number is not shown. Company name, plan, status, country, timezone, created date and seat counts are shown.
- Anything more (a name, a full address) is record-level detail and comes only through a tenant-approved support grant (Prompt 2).

If support finds the masked address is not enough to recognise an account, widen it here (for example show the domain only) rather than showing names.
