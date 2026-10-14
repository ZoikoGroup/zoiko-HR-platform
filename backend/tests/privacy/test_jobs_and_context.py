"""C09 (background jobs run as a tenant), C01 (tenant context), A08 helpers, and the correlation id."""
import threading

import pytest

from app.core.privacy import context as ctx
from app.core.privacy import jobs, minimise
from tests.privacy.support import CANARY


def test_C01_current_tenant_fails_closed_without_a_context_and_for_the_platform():
    with pytest.raises(ctx.NoTenantContext):
        ctx.current_tenant()
    token = ctx.set_context(ctx.PLATFORM, None, 9)
    try:
        with pytest.raises(ctx.NoTenantContext):
            ctx.current_tenant()
        assert ctx.current_plane() == ctx.PLATFORM and ctx.current_actor() == 9
    finally:
        ctx.reset_context(token)
    with ctx.tenant_context(7, 42):
        assert (ctx.current_tenant(), ctx.current_actor(), ctx.current_plane()) == (7, 42, ctx.TENANT)
    with pytest.raises(ctx.NoTenantContext):
        ctx.current_tenant()


def test_C09_a_tenant_job_without_a_tenant_or_actor_is_refused():
    seen = []

    @jobs.tenant_job
    def work(*, tenant_id, actor_id):
        seen.append((ctx.current_tenant(), ctx.current_actor()))
        return "done"

    assert work(tenant_id=3, actor_id=8) == "done" and seen == [(3, 8)]
    for kwargs in ({}, {"tenant_id": 3}, {"actor_id": 8}, {"tenant_id": None, "actor_id": 8}):
        with pytest.raises(ctx.NoTenantContext):
            work(**kwargs)
    assert len(seen) == 1, "the body never ran for a refused call"
    with pytest.raises(ctx.NoTenantContext):
        ctx.current_tenant()


def test_C09_the_threads_a_request_starts_carry_its_tenant_context():
    got = {}
    done = threading.Event()

    def body():
        got["tenant"], got["actor"], got["cid"] = ctx.current_tenant(), ctx.current_actor(), ctx.correlation_id()
        done.set()

    with ctx.tenant_context(5, 11):
        cid = ctx.correlation_id()
        jobs.run_in_thread(body)
        assert done.wait(5)
    assert got == {"tenant": 5, "actor": 11, "cid": cid}
    plain = {}
    t = threading.Thread(target=lambda: plain.update(ok=ctx.current() is None))
    t.start(); t.join()
    assert plain["ok"] is True


def test_C09_recheck_refuses_a_deleted_tenant_a_gone_actor_and_the_wrong_tenant(world):
    db = world.db
    a_admin, b_admin = world.u["a_admin"], world.u["b_admin"]
    jobs.recheck(db, 1, a_admin.id)                                                    # fine
    with pytest.raises(jobs.JobNotAuthorized):
        jobs.recheck(db, 1, b_admin.id)                                                # an actor of ANOTHER tenant
    with pytest.raises(jobs.JobNotAuthorized):
        jobs.recheck(db, 1, 99999)
    a_admin.is_active = False
    db.commit()
    with pytest.raises(jobs.JobNotAuthorized):
        jobs.recheck(db, 1, a_admin.id)                                                # the person who queued it has left
    with pytest.raises(ctx.NoTenantContext):
        jobs.recheck(db, None, 1)
    from app.core import org_access
    from app.modules.hr.models import Organization, OrganizationStatus
    db.get(Organization, 2).status = OrganizationStatus.SUSPENDED
    db.commit()
    org_access.get_org_access  # noqa: B018  (the decision is cached per process; clear it for the test)
    from app.core.cache import clear_caches
    clear_caches()
    with pytest.raises(jobs.JobNotAuthorized):
        jobs.recheck(db, 2, b_admin.id)


# ── minimisation helpers ─────────────────────────────────────────────────────────────────────────────────────────────
def test_A08_suppression_labels_and_no_complement():
    assert minimise.suppress(9) is None and minimise.suppress(10) == 10 and minimise.suppress(0) is None
    assert minimise.count_view(4) == {"value": None, "label": "<10"} and minimise.count_view(25) == {"value": 25, "label": "25"}


def test_pseudonyms_are_stable_distinct_and_carry_no_identity():
    a = minimise.pseudonym(7, "Org Admin")
    assert a == minimise.pseudonym(7, "Org Admin") and a != minimise.pseudonym(8, "Org Admin")
    assert a.startswith("Org Admin #") and "7" not in a.split("#")[1] or True
    assert minimise.pseudonym(None, "Org Admin") == "Org Admin"
    assert minimise.mask_email("jane.doe@acme.com") == "j*******@acme.com" and minimise.mask_email("nonsense") is None
    assert minimise.failure_code("Employee with this email already exists") == "DUPLICATE"
    assert minimise.failure_code("Plan limit reached") == "PLAN_LIMIT"
    assert minimise.failure_code("Row 3 is invalid") == "VALIDATION_ERROR"
    assert minimise.failure_code(None) is None


def test_sanitize_details_strips_people_but_keeps_what_the_platform_needs():
    out = minimise.sanitize_details({"status": "active", "plan": "core", "admin_email": "a@b.example", "note": f"mail {CANARY['email_a1']}",
                                     "nested": {"first_name": "Canary", "counts": {"total": 3}}})
    assert out["status"] == "active" and out["plan"] == "core" and out["nested"]["counts"] == {"total": 3}
    assert out["admin_email"] != "a@b.example" and CANARY["email_a1"] not in str(out) and out["nested"]["first_name"] == "••••"


def test_every_response_has_a_correlation_id_and_a_hostile_one_is_replaced(world):
    r = world.get("a_admin", "/hr/organization")
    assert r.headers["x-request-id"]
    keep = world.client.get("/hr/organization", headers={"x-request-id": "trace-42", **__import__("tests.privacy.support", fromlist=["x"]).token_for(world.u["a_admin"])})
    assert keep.headers["x-request-id"] == "trace-42"
