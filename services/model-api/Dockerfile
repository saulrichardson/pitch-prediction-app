FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PITCHPREDICT_CACHE_DIR=/var/cache/pitchpredict
ENV PITCHPREDICT_LOG_DIR=/tmp/pitchpredict-logs

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "torch==2.11.0"
RUN pip install --no-cache-dir \
  "fastapi>=0.121.0" \
  "pitchpredict==0.5.0" \
  "pydantic>=2.12.0" \
  "uvicorn[standard]>=0.38.0"

COPY src ./src

RUN useradd --create-home --uid 10001 appuser \
  && mkdir -p /var/cache/pitchpredict /tmp/pitchpredict-logs \
  && chown -R appuser:appuser /var/cache/pitchpredict /tmp/pitchpredict-logs /app

USER appuser

EXPOSE 8000
CMD ["uvicorn", "pitch_model_api.main:app", "--app-dir", "src", "--host", "0.0.0.0", "--port", "8000"]
