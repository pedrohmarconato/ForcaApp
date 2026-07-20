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
# --timeout 180: acima do timeout do cliente Anthropic (chat 120s / plano 150s) e
# abaixo do proxy_read_timeout do nginx (200s). Sem isso, o default de 30s do
# gunicorn mataria respostas do Opus 4.8 (effort high, adaptive thinking).
CMD ["gunicorn", "--worker-class", "gthread", "--workers", "1", "--threads", "8", "--timeout", "180", "--bind", "0.0.0.0:5001", "backend.app:app"]
