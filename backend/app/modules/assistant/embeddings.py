"""
modules/assistant/embeddings.py
----------------------------------
Local embedding model wrapper (fastembed, ONNX-based — no torch/GPU, no
external API key). Groq has no embeddings endpoint, so retrieval uses this
separate local model; swapping models later only touches this file.
"""

import logging

from app.config import settings

logger = logging.getLogger("zoiko.assistant")

_model = None


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(model_name=settings.EMBEDDING_MODEL)
    return _model


def embed_text(text: str) -> list[float]:
    """Embed a single string. Returns a plain list[float] suitable for a
    pgvector column."""
    model = _get_model()
    vectors = list(model.embed([text]))
    return vectors[0].tolist()


def embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _get_model()
    return [v.tolist() for v in model.embed(texts)]
