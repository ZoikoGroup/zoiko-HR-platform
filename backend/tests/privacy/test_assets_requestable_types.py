"""QA bug 19: the employee's "Request New Asset" list is the assets their organisation holds (the Assets page), not a fixed
list. One entry per asset name (case and spacing merged), with how many are free; retired, lost and deleted assets and
other organisations' assets are not offered."""
from datetime import datetime

from app.modules.hr.models import Asset, AssetStatus


def _asset(w, name, tag, org=1, status=AssetStatus.AVAILABLE, deleted=False):
    w.db.add(Asset(name=name, asset_tag=tag, organization_id=org, status=status,
                   deleted_at=datetime.utcnow() if deleted else None))


def test_an_employee_sees_the_kinds_of_asset_their_organisation_holds(world):
    _asset(world, "Laptop", "L-1")
    _asset(world, "laptop ", "L-2", status=AssetStatus.ASSIGNED)
    _asset(world, "Mouse", "M-1", status=AssetStatus.ASSIGNED)
    _asset(world, "Projector", "P-1", status=AssetStatus.RETIRED)
    _asset(world, "Headset", "H-1", status=AssetStatus.LOST)
    _asset(world, "Webcam", "W-1", deleted=True)
    _asset(world, "Tablet", "T-1", org=2)
    world.db.commit()

    r = world.get("a_emp1", "/hr/assets/requestable-types")
    assert r.status_code == 200, r.text
    assert r.json()["items"] == [{"name": "Laptop", "total": 2, "available": 1},
                                 {"name": "Mouse", "total": 1, "available": 0}]


def test_with_no_assets_the_list_is_empty(world):
    assert world.get("a_emp1", "/hr/assets/requestable-types").json()["items"] == []
