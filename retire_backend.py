path = r"D:\zoiko-hr-platform\backend\tests\test_delinquency.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Remove the TestSupportAccess class and its comment header
old = """# Support access grants (time-bounded, tenant-scoped)
# ══════════════════════════════════════════════════════════════════════════

class TestSupportAccess:
    def test_validate_valid_token(self, db):
        _make_org(db, org_id=1)
        grant, raw = ds.mint_support_access(db, 1, "ops@z", ttl_hours=24)
        ok = ds.validate_support_access(db, 1, raw)
        assert ok.id == grant.id

    def test_validate_expired_token(self, db):
        _make_org(db, org_id=1)
        grant, raw = ds.mint_support_access(db, 1, "ops@z", ttl_hours=1)
        with freeze_time(datetime.utcnow() + timedelta(hours=2)):
            with pytest.raises(ValueError) as exc:
                ds.validate_support_access(db, 1, raw)
            assert "expired" in str(exc.value)

    def test_revoked_token_rejected(self, db):
        _make_org(db, org_id=1)
        grant, raw = ds.mint_support_access(db, 1, "ops@z", ttl_hours=24)
        ds.revoke_support_access(db, grant.id, "ops2@z")
        with pytest.raises(ValueError) as exc:
            ds.validate_support_access(db, 1, raw)
        assert "invalid" in str(exc.value)

    def test_grant_tenant_scoped(self, db):
        _make_org(db, org_id=1)
        _make_org(db, org_id=2)
        _grant, raw = ds.mint_support_access(db, 1, "ops@z", ttl_hours=24)
        # Token minted for org 1 cannot be used against org 2.
        with pytest.raises(ValueError):
            ds.validate_support_access(db, 2, raw)


# Webhook integration
# ══════════════════════════════════════════════════════════════════════════"""

new = """# Webhook integration
# ══════════════════════════════════════════════════════════════════════════"""

if old in content:
    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Removed TestSupportAccess class")
else:
    print("Pattern not found, showing context...")
    # Show context around the area
    idx = content.find("# Support access grants")
    if idx >= 0:
        print(content[idx:idx+500])