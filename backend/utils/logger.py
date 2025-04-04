# backend/utils/logger.py
import logging
import sys

class WrapperLogger:
    """Logger simples para os wrappers."""
    _handlers = {} # Evita adicionar handlers múltiplos para o mesmo logger

    def __init__(self, name: str, level=logging.INFO):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(level)

        # Adiciona handler apenas se não existir para este logger
        if name not in WrapperLogger._handlers:
            handler = logging.StreamHandler(sys.stdout)
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            WrapperLogger._handlers[name] = handler # Marca que o handler foi adicionado

    def info(self, message):
        self.logger.info(message)

    def warning(self, message):
        self.logger.warning(message)

    def error(self, message, exc_info=False):
        self.logger.error(message, exc_info=exc_info)

    def debug(self, message):
        self.logger.debug(message)