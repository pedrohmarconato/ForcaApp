# backend/Dockerfile
# Imagem do backend Flask do ForcaApp (produção via gunicorn)
FROM python:3.11-slim

WORKDIR /app

# Dependências primeiro (cache de camadas)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código do backend (inclui wrappers/utils)
COPY backend/ ./backend/

ENV PORT=5001
EXPOSE 5001

# 1 worker com threads: o rate limit é em memória (por processo) —
# mais workers multiplicariam o limite efetivo (ver backend/app.py).
CMD ["gunicorn", "--worker-class", "gthread", "--workers", "1", "--threads", "8", "--bind", "0.0.0.0:5001", "backend.app:app"]
