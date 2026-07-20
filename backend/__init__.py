# backend/__init__.py
# Marca `backend` como pacote regular para que `backend.app:app` (gunicorn,
# Dockerfile) e `python3 -m backend.app` resolvam deterministicamente.
# Os subpacotes (utils, services, wrappers) já possuem __init__.py próprios.
