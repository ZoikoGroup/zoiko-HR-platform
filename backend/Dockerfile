FROM python:3.12-slim

# tesseract-ocr: pytesseract is only a wrapper — OCR fails at runtime without
#   the actual binary + language data.
# libpq-dev + gcc: build deps for any package without a prebuilt manylinux
#   wheel on this base image; cheap to keep, avoids silent install failures.
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        libpq-dev \
        gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# fastembed defaults to caching model weights under /tmp. Several serverless
# platforms (Cloud Run among them) mount /tmp as a fresh, empty tmpfs at
# container start, which would silently discard whatever gets baked in below.
# Redirect the cache outside /tmp so it survives in the image layer.
ENV FASTEMBED_CACHE_PATH=/app/.cache/fastembed

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the embedding model into the image at build time so cold starts never
# depend on a runtime download from HuggingFace.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"

COPY . .

RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080

EXPOSE 8080

# No curl in the base image — a stdlib urlopen avoids adding one just for this.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://localhost:' + os.environ.get('PORT', '8080') + '/super-admin/health', timeout=3)"

# Run `docker run --rm <image> alembic upgrade head` as a separate deploy
# step before rolling out a new revision — not run automatically here, so
# concurrently-starting instances (Cloud Run, multiple GKE pods) never race
# each other applying the same migration.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
