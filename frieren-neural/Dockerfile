FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app/frieren-neural \
    FRIEREN_MODEL_BACKEND=ufakzeka \
    FRIEREN_MODEL_THREADS=2 \
    FRIEREN_CONTEXT_SIZE=2048 \
    FRIEREN_GGUF_MODEL_PATH=/tmp/frieren-neural/models/ufakzeka-1-q8_0.gguf

WORKDIR /app

RUN python -m pip install --upgrade pip \
    && python -m pip install \
      --only-binary=llama-cpp-python \
      --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu \
      fastapi==0.115.12 \
      uvicorn==0.34.0 \
      llama-cpp-python==0.3.36

COPY frieren-neural /app/frieren-neural

EXPOSE 10000

CMD ["sh", "-c", "exec uvicorn frieren_neural.api:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
