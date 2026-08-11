from cachetools import TTLCache

cache = TTLCache(maxsize=128, ttl=120)


def get_cached(key: str):
    return cache.get(key)


def set_cached(key: str, value):
    cache[key] = value


def invalidate_cache(pattern: str):
    keys_to_delete = [k for k in cache.keys() if k.startswith(pattern)]
    for k in keys_to_delete:
        del cache[k]
