"""Background jobs run in exactly one process: always for a single worker, by advisory lock for several."""

import pytest

import app.core.leader as leader


class _Dialect:
    def __init__(self, name):
        self.name = name


class _Conn:
    def __init__(self, got):
        self.got, self.closed = got, False

    def exec_driver_sql(self, *_a, **_k):
        got = self.got

        class _R:
            def scalar(self_inner):
                return got
        return _R()

    def close(self):
        self.closed = True


class _Engine:
    """Hands out one connection per connect(); `answers` is the lock result for each successive attempt."""

    def __init__(self, name="postgresql", answers=(True,), fail=False):
        self.dialect, self.answers, self.fail, self.conns = _Dialect(name), list(answers), fail, []

    def connect(self):
        if self.fail:
            raise RuntimeError("db down")
        got = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        conn = _Conn(got)
        self.conns.append(conn)
        return conn


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    leader._held_connection = None
    for name in ("HR_BACKGROUND_JOBS", "WEB_CONCURRENCY", "HR_WORKERS"):
        monkeypatch.delenv(name, raising=False)
    yield
    leader._held_connection = None


def test_a_single_process_deploy_always_leads_without_touching_the_database():
    e = _Engine(answers=(False,))  # even a held lock must not matter: there is nothing to elect
    assert leader.acquire_background_leadership(e) is True
    assert e.conns == []


def test_sqlite_is_always_the_leader(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "4")
    assert leader.acquire_background_leadership(_Engine("sqlite")) is True


def test_with_several_workers_the_one_that_gets_the_lock_leads_and_keeps_it(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    e = _Engine(answers=(True,))
    assert leader.acquire_background_leadership(e) is True
    assert e.conns[0].closed is False
    assert leader.acquire_background_leadership(_Engine(answers=(False,))) is True  # already leading


def test_another_worker_waits_then_gives_up_and_releases_every_probe_connection(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    e = _Engine(answers=(False,))
    naps = []
    assert leader.acquire_background_leadership(e, wait_seconds=0.05, sleep=lambda s: (naps.append(s), __import__("time").sleep(0.03))) is False
    assert len(e.conns) >= 2 and all(c.closed for c in e.conns) and naps


def test_a_restart_handing_over_from_the_old_process_still_ends_with_a_leader(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    e = _Engine(answers=(False, False, True))  # the old process lets go on the third attempt
    assert leader.acquire_background_leadership(e, wait_seconds=5, sleep=lambda s: None) is True
    assert [c.closed for c in e.conns] == [True, True, False]


def test_when_the_lock_cannot_be_checked_no_jobs_start(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    assert leader.acquire_background_leadership(_Engine(fail=True)) is False


def test_the_operator_can_force_jobs_on_or_off(monkeypatch):
    monkeypatch.setenv("HR_BACKGROUND_JOBS", "off")
    assert leader.acquire_background_leadership(_Engine()) is False
    monkeypatch.setenv("HR_BACKGROUND_JOBS", "on")
    monkeypatch.setenv("WEB_CONCURRENCY", "3")
    assert leader.acquire_background_leadership(_Engine(answers=(False,))) is True
