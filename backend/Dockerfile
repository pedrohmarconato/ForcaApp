# backend/Dockerfile
# Imagem do backend Flask do ForcaApp (produção via gunicorn)
FROM python:3.11-slim

WORKDIR /app

# Dependências primeiro (cache de camadas).
#
# DEP-01 do review de 31/07/2026: instalar de `requirements.txt` (faixas
# amplas, sem lock) fazia dois deploys do MESMO commit resolverem versões
# diferentes — inclusive transitivas que ninguém revisou. O lock fixa a árvore
# inteira e `--require-hashes` recusa qualquer artefato cujo conteúdo não bata
# com o hash gravado, o que também fecha a porta para um pacote substituído no
# índice.
#
# `requirements.txt` continua sendo a fonte editável (as faixas declaram a
# intenção); o lock é derivado dele:
#   uv pip compile requirements.txt --generate-hashes --python-version 3.11 \
#     --output-file requirements.lock.txt
COPY requirements.lock.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock.txt

# Código do backend (inclui wrappers/utils)
COPY backend/ ./backend/

# INFRA-03 do review de 31/07/2026: a imagem não tinha USER, então o gunicorn
# rodava como root dentro do container. Execução de código no Flask ou numa
# dependência passava a operar como root, com o filesystem gravável e as
# capabilities padrão. O uid fixo (10001) é alto o bastante para não colidir
# com usuário do host e torna o mapeamento previsível se um volume for montado.
#
# O chown cobre /app inteiro: sem ele o processo não-root não lê o próprio
# código quando o WORKDIR herda permissões restritivas.
RUN groupadd --system --gid 10001 forca \
 && useradd --system --uid 10001 --gid forca --no-create-home --shell /usr/sbin/nologin forca \
 && chown -R forca:forca /app
USER forca

# Com `read_only: true` no Compose o rootfs não aceita escrita: sem isto o
# Python tentaria gravar .pyc a cada import e falharia em silêncio a cada vez.
# PYTHONUNBUFFERED mantém o log saindo na hora, que é como o
# forcaapp-hml-deploy.log fica útil.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

ENV PORT=5001
EXPOSE 5001

# 1 worker com threads: o rate limit é em memória (por processo) —
# mais workers multiplicariam o limite efetivo (ver backend/app.py).
# --timeout 240: acima do timeout da Anthropic (job do molde Opus 4.8
# com thinking adaptive = 240s) e abaixo do proxy_read_timeout do
# nginx (200s → aumentado para 300s no vhost). Sem isso, o default de
# 30s do gunicorn mataria a geração.
CMD ["gunicorn", "--worker-class", "gthread", "--workers", "1", "--threads", "8", "--timeout", "240", "--bind", "0.0.0.0:5001", "backend.app:app"]
