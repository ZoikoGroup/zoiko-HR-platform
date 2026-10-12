"""Small query helpers shared by the performance rewrites (Phase 2)."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def latest_per_group(db: Session, model, group_col, order_col, columns):
    """The newest row per group, e.g. each organization's latest snapshot, without loading the whole history.

    Returns rows of `columns` (column objects of `model`). Ties on `order_col` are broken by the higher id, which is
    what "insertion order" meant for the old load-everything-and-keep-the-first loops.

    PostgreSQL: SELECT DISTINCT ON (group) ... ORDER BY group, order DESC, id DESC (one index scan with the
    (group, order DESC) index). Other dialects (SQLite in tests): a ROW_NUMBER() window, same result.
    """
    pk = model.id
    if db.get_bind().dialect.name == "postgresql":
        stmt = (
            select(*columns)
            .distinct(group_col)
            .order_by(group_col, order_col.desc(), pk.desc())
        )
        return db.execute(stmt).all()
    rn = func.row_number().over(partition_by=group_col, order_by=(order_col.desc(), pk.desc())).label("_rn")
    inner = select(*columns, rn).subquery()
    stmt = select(*[inner.c[c.key] for c in columns]).where(inner.c._rn == 1)
    return db.execute(stmt).all()
