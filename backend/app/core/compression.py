"""Response compression that leaves streaming endpoints alone.

Starlette's GZipMiddleware buffers the compressor output, which would hold back server-sent events until the
stream ends, so the assistant's streaming routes bypass it. Everything else (lists, dashboards, exports)
is compressed when the client accepts gzip and the body is at least `minimum_size` bytes.
"""
from starlette.middleware.gzip import GZipMiddleware

UNCOMPRESSED_PREFIXES = ("/assistant",)


class SelectiveGZipMiddleware(GZipMiddleware):
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("path", "").startswith(UNCOMPRESSED_PREFIXES):
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)
