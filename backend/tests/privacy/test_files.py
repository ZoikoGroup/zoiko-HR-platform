"""C05 / E08 / T02: tenant files are filed under the tenant, served only through checked paths, and linked only for five minutes."""
import time

import pytest

from app.core.privacy import files
from app.modules.hr.models import HrDocument
from tests.privacy.support import token_for


def test_C05_uploads_are_filed_under_the_tenant(tmp_path):
    p1 = files.tenant_upload_path(str(tmp_path), 7, "abc.pdf")
    assert p1.replace("\\", "/").endswith("/t7/abc.pdf") and files.path_tenant(p1) == 7
    assert files.tenant_upload_path(str(tmp_path), 7, "../../etc/passwd").replace("\\", "/").endswith("/t7/passwd"), "no path climbing"
    with pytest.raises(ValueError):
        files.tenant_upload_path(str(tmp_path), None, "x.pdf")
    assert files.belongs_to_tenant(p1, 7) and not files.belongs_to_tenant(p1, 8)
    assert files.belongs_to_tenant("/tmp/uploads/hr_documents/legacy.pdf", 8), "files stored before prefixes existed keep working"


def test_C05_a_signed_link_is_bound_short_and_tamper_proof():
    now = 1_000_000.0
    tok = files.sign_download("hr_document", 5, 1, now=now)
    assert files.verify_download(tok, now=now + 10) == {"kind": "hr_document", "object_id": 5, "organization_id": 1}
    with pytest.raises(ValueError):
        files.verify_download(tok, now=now + 301)                                      # five minutes, no more
    long = files.sign_download("hr_document", 5, 1, ttl_seconds=86400, now=now)
    with pytest.raises(ValueError):
        files.verify_download(long, now=now + 301)                                     # asking for longer does not get longer
    body, sig = tok.split(".")
    other = files.sign_download("hr_document", 6, 1, now=now).split(".")[0]
    for bad in (other + "." + sig, body + "." + sig[:-2] + "AA", "garbage", "", body, tok + "x"):
        with pytest.raises(ValueError):
            files.verify_download(bad, now=now + 1)


@pytest.fixture
def docs(world, tmp_path):
    def make(org, owner_key, title):
        path = files.tenant_upload_path(str(tmp_path), org, f"{title}.txt")
        with open(path, "w") as fh:
            fh.write(f"CANARY-FILE-{title}")
        d = HrDocument(title=title, file_path=path, file_name=f"{title}.txt", mime_type="text/plain", organization_id=org, employee_id=world.u[owner_key].id, status="approved")
        world.db.add(d)
        world.db.commit()
        return d
    return {"a": make(1, "a_emp1", "alpha"), "b": make(2, "b_emp1", "beta")}


def test_T02_the_link_endpoint_checks_the_callers_tenant_and_the_signed_url_serves_the_file(world, docs):
    ok = world.post("a_admin", f"/hr/documents/{docs['a'].id}/download-link")
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["expires_in"] == 300 and body["url"].startswith("/hr/files/signed/")
    served = world.client.get(body["url"])                                             # no Authorization header: the link is the capability
    assert served.status_code == 200 and "CANARY-FILE-alpha" in served.text and served.headers["cache-control"] == "private, no-store"
    miss = world.post("a_admin", f"/hr/documents/{docs['b'].id}/download-link")
    gone = world.post("a_admin", "/hr/documents/987654/download-link")
    assert miss.status_code == gone.status_code == 404, "another tenant's document looks exactly like a missing one"


def test_T02_guessed_expired_forged_and_cross_tenant_links_all_look_like_nothing(world, docs):
    blank = world.client.get("/hr/files/signed/garbage")
    assert blank.status_code == 404 and blank.json() == {"detail": "Not Found"}
    expired = files.sign_download("hr_document", docs["a"].id, 1, now=time.time() - 3600)
    assert world.client.get(f"/hr/files/signed/{expired}").json() == blank.json()
    # a link signed for tenant 1 but naming tenant 2's document: the lookup is scoped to the link's tenant, so it finds nothing
    cross = files.sign_download("hr_document", docs["b"].id, 1)
    r = world.client.get(f"/hr/files/signed/{cross}")
    assert r.status_code == 404 and "CANARY-FILE-beta" not in r.text
    wrong_kind = files.sign_download("something_else", docs["a"].id, 1)
    assert world.client.get(f"/hr/files/signed/{wrong_kind}").status_code == 404


def test_E08_the_authenticated_file_endpoint_refuses_a_path_filed_under_another_tenant(world, docs, tmp_path):
    # a record of tenant 1 whose stored path points into tenant 2's folder: refused even though the file exists
    bad = HrDocument(title="sneaky", file_path=docs["b"].file_path, file_name="sneaky.txt", mime_type="text/plain", organization_id=1, employee_id=world.u["a_emp1"].id, status="approved")
    world.db.add(bad)
    world.db.commit()
    r = world.get("a_admin", f"/hr/documents/{bad.id}/file")
    assert r.status_code == 410 and "CANARY-FILE-beta" not in r.text
    fine = world.get("a_admin", f"/hr/documents/{docs['a'].id}/file")
    assert fine.status_code == 200 and "CANARY-FILE-alpha" in fine.text
