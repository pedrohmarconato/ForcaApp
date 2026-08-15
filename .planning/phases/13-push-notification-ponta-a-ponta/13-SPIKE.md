# Phase 13 — Spike técnico: pywebpush (critério 1, obrigatório)

**Executado:** 2026-08-15
**Ambiente:** venv temporário, FORA do repo —
`/private/tmp/claude-501/-Users-phmarconato-ForcaApp/04dbadf6-21b6-4415-8ddd-371b8e8a694f/scratchpad/spike-pywebpush/`
(Python 3.9.6, macOS/Darwin, LibreSSL 2.8.3)

**Veredito: GO.** `pywebpush` envia de verdade, levanta `WebPushException` com
`response.status_code` acessível, e o padrão "410/404 → apagar subscription"
funciona exatamente como a pesquisa de milestone previa — comportamento
comprovado por execução real, não só leitura de doc.

---

## 1. Instalação e versão real (não a que a pesquisa de milestone assumiu)

```bash
python3 -m venv venv && source venv/bin/activate
pip install pywebpush
```

Saída real (`pip show`):

```
pywebpush : Version: 2.1.2
py-vapid  : Version: 1.9.4
http-ece  : Version: 1.2.1
```

`pip index versions pywebpush` confirma: **2.1.2 é a versão mais recente
publicada no PyPI hoje** — `Available versions: 2.1.2, 2.1.1, 2.1.0, 2.0.3, ...`.

**[VERIFIED: pip index versions pywebpush, executado nesta sessão]** — a
milestone-level `SUMMARY.md`/`ARCHITECTURE.md` (pesquisa de 2026-08-14) citava
`pywebpush (2.4.0)`, que **não existe no índice do PyPI**. Essa versão está
incorreta/desatualizada; o RESEARCH.md desta fase usa `pywebpush==2.1.2` como
o pin real para `requirements.txt`. `py-vapid==1.9.4` bateu com o que a
pesquisa de milestone já tinha (confirmado, não corrigido).

Instala junto (dependências transitivas, todas do PyPI oficial): `cryptography`,
`cffi`, `http-ece`, `requests`, `aiohttp` (suporte a envio assíncrono, não
usado nesta fase), `py-vapid`.

---

## 2. Geração do par VAPID de TESTE (descartável)

```bash
vapid --gen
```

Gera `private_key.pem` e `public_key.pem` no diretório corrente via CLI do
`py-vapid` (instalado junto com `pywebpush`). Saída real:

```
Generating private_key.pem
Generating public_key.pem
```

`private_key.pem` (chave de TESTE, descartável — vive só no scratchpad, nunca
comitada, nunca é a chave de produção):

```
-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQglxHWPIYDNIDKiE/y
+BQMNocS7ZnCKxg9Ct1xy+O9AdihRANCAASCYqWWiZlywmXuWfv4RnY71WYPCWl2
mHEJt/r/C031+46VTxf1CE3mtGy/ZJBLxCYh7CsauZMG5dY+P8B6CmCI
-----END PRIVATE KEY-----
```

Chave pública convertida ao formato `applicationServerKey` (uncompressed
point, base64url) que `PushManager.subscribe({applicationServerKey: ...})`
espera no navegador:

```python
from py_vapid import Vapid02
v = Vapid02.from_file("private_key.pem")
pub = v.public_key
raw = pub.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
# base64url, sem padding
```

Saída real: `BIJipZaJmXLCZe5Z-_hGdjvVZg8JaXaYcQm3-v8LTfX7jpVPF_UITea0bL9kkEvEJiHsKxq5kwbl1j4_wHoKYIg`
(65 bytes — formato de ponto EC não comprimido, correto para `applicationServerKey`).

**Comando de produção equivalente** (a documentar no RESEARCH.md/PLAN): gerar
o par real uma única vez, guardar a privada como env var do VPS
(`VAPID_PRIVATE_KEY`), publicar a pública como
`EXPO_PUBLIC_VAPID_PUBLIC_KEY` no frontend — nunca reusar o par de teste
deste spike.

---

## 3. Assinatura real de `webpush()` (introspecção via `inspect`)

```python
import inspect
from pywebpush import webpush, WebPushException
print(inspect.signature(webpush))
```

Saída real:

```
(subscription_info: Dict[str, Union[str, bytes, Dict[str, Union[str, bytes]]]],
 data: Optional[str] = None,
 vapid_private_key: Union[NoneType, py_vapid.Vapid02, str] = None,
 vapid_claims: Optional[Dict[str, Union[str, int]]] = None,
 content_encoding: str = 'aes128gcm',
 curl: bool = False,
 timeout: Optional[float] = None,
 ttl: int = 0,
 verbose: bool = False,
 headers: Optional[Dict[str, Union[str, int, float]]] = None,
 requests_session: Optional[requests.sessions.Session] = None)
 -> Union[str, requests.models.Response]
```

`subscription_info` dict shape (confirmado pela docstring E pelo uso real
abaixo, mesmo shape que `PushSubscription.toJSON()` devolve no navegador):

```python
{
    "endpoint": "https://push.example.com/v1/abcd",
    "keys": {
        "p256dh": "0123abcd...",
        "auth": "001122...",
    },
}
```

`vapid_claims` — só `sub` é usado nesta fase: `{"sub": "mailto:contato@forcaapp..."}`.
`aud` e `exp` são preenchidos AUTOMATICAMENTE pelo `pywebpush` a partir do
`endpoint` da subscription — não são passados pelo chamador (confirmado na
seção 6 abaixo, decodificando o JWT real capturado).

---

## 4. Servidor HTTP fake local (`http.server` puro, sem framework)

`fake_push_server.py` — recebe o POST do `webpush()`, loga headers/body, e
devolve o status code passado por argv (410, 404, 400 ou 201 conforme o
teste):

```python
from http.server import BaseHTTPRequestHandler, HTTPServer
import sys

STATUS_CODE = int(sys.argv[1]) if len(sys.argv) > 1 else 410
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8055

class FakePushHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        self.send_response(STATUS_CODE)
        reason = (b'{"reason":"push subscription has unsubscribed or expired."}'
                  if STATUS_CODE == 410 else b'{"reason":"not found"}')
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(reason)))
        self.end_headers()
        self.wfile.write(reason)

HTTPServer(("127.0.0.1", PORT), FakePushHandler).serve_forever()
```

---

## 5. Chamada real e captura do `WebPushException` — 4 cenários testados

Script `spike_webpush_call.py` chama `webpush()` de verdade contra o fake
server, com `subscription_info` apontando pro `127.0.0.1:<porta>`, chave
privada de teste, `ttl=3600`, `headers={"Urgency": "normal"}`.

### 5a. Rodada 410 (Gone) — subscription expirada, caso central do spike

Saída LITERAL da execução:

```
=== WebPushException CAPTURADA ===
repr(exc)         : WebPushException('Push failed: 410 Gone\nResponse body:{"reason":"push subscription has unsubscribed or expired."}')
str(exc)           : WebPushException: Push failed: 410 Gone
Response body:{"reason":"push subscription has unsubscribed or expired."}, Response {"reason":"push subscription has unsubscribed or expired."}
type(exc)          : <class 'pywebpush.WebPushException'>
exc.args           : ('Push failed: 410 Gone\nResponse body:{"reason":"push subscription has unsubscribed or expired."}',)
dir(exc) (publicos): ['args', 'message', 'response', 'with_traceback']

exc.response        : <Response [410]>
exc.response.status_code: 410
exc.response.reason     : Gone
exc.response.text       : {"reason":"push subscription has unsubscribed or expired."}
exc.response.headers    : {'Server': 'BaseHTTP/0.6 Python/3.9.6', 'Date': 'Sat, 15 Aug 2026 14:15:51 GMT', 'Content-Type': 'application/json', 'Content-Length': '59'}

>>> STATUS 410: subscription expirada/invalida -> DELETE imediato na tabela push_subscriptions (sem orfaos).
```

**`exc.response` é o `requests.Response` real** (não um mock, não um dict
próprio) — `exc.response.status_code` é a via de acesso confirmada. `WebPushException`
(código-fonte via `inspect.getsource`, ver seção 7) só expõe `message` e
`response` — nada mais.

O que o fake server recebeu (log do lado servidor, prova de que o POST é
Web Push válido de verdade, não um stub simulado):

```
[fake-server] Recebido POST /push/fake-endpoint-id-abc123 (145 bytes de body cifrado)
[fake-server] Headers recebidos: {'Host': '127.0.0.1:8055', 'User-Agent': 'python-requests/2.32.5',
 'urgency': 'normal',
 'authorization': 'vapid t=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwOi8vMTI3LjAuMC4xOjgwNTUiLCJleHAiOjE3ODY4NDY1NTEsInN1YiI6Im1haWx0bzp0ZXN0ZS1zcGlrZUBmb3JjYWFwcC5pbnZhbGlkIn0.KQnsn0S6wUmXGAbHLqVH398-bJgMzBX9p3lsGIXc4oTvZxY6OsN7BEL2pOZPtHyai0JLDds7bu4I8_BKaiokZw,k=BIJipZaJmXLCZe5Z-_hGdjvVZg8JaXaYcQm3-v8LTfX7jpVPF_UITea0bL9kkEvEJiHsKxq5kwbl1j4_wHoKYIg',
 'content-encoding': 'aes128gcm', 'ttl': '3600', 'Content-Length': '145'}
```

Confirma: `Authorization: vapid t=<JWT>,k=<applicationServerKey>` (JWT ES256
real, assinado com a chave de teste), `Content-Encoding: aes128gcm`, `TTL:
3600`, `Urgency: normal` — corpo cifrado de 145 bytes para uma mensagem de
texto curta (overhead do envelope aes128gcm).

### 5b. Rodada 404 (Not Found) — mesmo tratamento que 410

```
exc.response.status_code: 404
exc.response.reason     : Not Found
exc.response.text       : {"reason":"not found"}

>>> STATUS 404: subscription expirada/invalida -> DELETE imediato na tabela push_subscriptions (sem orfaos).
```

Confirma que o MESMO padrão (`if status in (404, 410): apagar`) cobre os dois
códigos — necessário porque diferentes push services (Apple, Mozilla, Google)
não são 100% consistentes entre 404 e 410 para "subscription não existe mais".

### 5c. Rodada 201 (sucesso) — contraste, para provar que o caminho feliz NÃO levanta exceção

```
=== SUCESSO (inesperado neste spike) ===
response: <Response [201]>
```

`webpush()` devolve o `requests.Response` diretamente (sem exceção) quando o
push service aceita a entrega — nenhuma ambiguidade entre "sucesso" e "erro
silencioso".

### 5d. Rodada 400 (Bad Request) — contraste negativo, prova que o código NÃO trata tudo como expiração

```
exc.response.status_code: 400
>>> STATUS 400: erro nao classificado como expiracao -> NAO apagar subscription (log + retry conforme politica).
```

Confirma que a implementação de produção deve usar `if status_code in (404,
410)` — não um catch-all de `WebPushException` — para não apagar subscriptions
válidas por causa de erro transitório (ex.: payload malformado, rate limit do
push service).

---

## 6. VAPID claims: `aud`/`exp` automáticos, decodificados do JWT real capturado

```python
jwt = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwOi8vMTI3LjAuMC4xOjgwNTUiLCJleHAiOjE3ODY4NDY1NTEsInN1YiI6Im1haWx0bzp0ZXN0ZS1zcGlrZUBmb3JjYWFwcC5pbnZhbGlkIn0...."
```

Header/payload decodificados:

```python
header : {'typ': 'JWT', 'alg': 'ES256'}
payload: {'aud': 'http://127.0.0.1:8055', 'exp': 1786846551, 'sub': 'mailto:teste-spike@forcaapp.invalid'}
exp em UTC: 2026-08-16 02:15:51
agora UTC : 2026-08-15 14:16:39.937952
delta     : 11:59:11 (~12h)
```

Confirma:
- `aud` é derivado AUTOMATICAMENTE do `endpoint` da subscription (scheme +
  host + porta) — o chamador nunca passa `aud` manualmente.
- `exp` default é **~12h a partir de agora** — não configurável via
  `vapid_claims` nesta chamada (não foi passado `exp` no dict e o `pywebpush`
  preencheu sozinho). Suficiente para um envio síncrono (lembrete/replan);
  irrelevante para retry além de 12h (nesse caso o `webpush()` reassina o JWT
  na nova chamada).
- `sub` é exatamente o que foi passado em `vapid_claims={"sub": "mailto:..."}`
  — literal, sem transformação.
- Assinatura `ES256` (ECDSA P-256 + SHA-256), consistente com a curva da chave
  gerada pelo `vapid --gen`.

---

## 7. Código-fonte real de `WebPushException` (via `inspect.getsource`)

```python
class WebPushException(Exception):
    """Web Push failure.

    This may contain the requests.Response

    """

    def __init__(self, message, response=None):
        self.message = message
        self.response = response

    def __str__(self):
        extra = ""
        if self.response is not None:
            try:
                extra = ", Response {}".format(
                    self.response.text,
                )
            except AttributeError:
                extra = ", Response {}".format(self.response)
        return "WebPushException: {}{}".format(self.message, extra)
```

**Único contrato estável para o código de produção**: `exc.response` (pode
ser `None` em falha de rede/timeout — checar antes de acessar
`.status_code`) e `exc.message`. `dir(exc)` confirmado na seção 5a: só
`args`, `message`, `response`, `with_traceback` — nada mais a depender.

---

## 8. TTL, Urgency e payload — o que ficou provado vs. o que é doc externa

| Item | Status | Evidência |
|------|--------|-----------|
| `ttl=3600` (segundos) vira header `TTL: 3600` no POST | **[VERIFIED — executado nesta sessão]** | Log do fake server, seção 5a |
| `headers={"Urgency": "normal"}` vira header `urgency: normal` no POST | **[VERIFIED — executado nesta sessão]** | Log do fake server, seção 5a |
| `Content-Encoding: aes128gcm` é o default e foi usado sem configuração extra | **[VERIFIED — executado nesta sessão]** | Log do fake server, seção 5a |
| Payload máximo prático ~4 KB (limite do PUSH SERVICE, não do `pywebpush`) | **[CITED: RFC 8030 / documentação geral de Web Push — NÃO testado neste spike]** | `pywebpush` não tem nenhuma checagem de tamanho no código-fonte (`inspect.getsource` não encontrou nenhuma constante de limite/padding de tamanho) — o limite é imposto pelo push service real (Apple/Mozilla/Google), que o servidor fake local não reproduz. Manter mensagens curtas (texto do lembrete/replanejamento, sem payload rico) é a prática segura; não há como validar o limite exato de 4 KB do endpoint real do Safari/iOS nesta máquina sem toolchain nativa. |

---

## 9. Veredito

**GO.** Os 5 pontos do escopo do spike (CONTEXT.md) estão provados por
execução real, não leitura de documentação:

1. **Envio real via `pywebpush`** — provado (seções 3, 5, 6): `webpush()`
   chamado de verdade contra um servidor HTTP real (ainda que fake/local),
   produzindo um POST HTTP válido com header VAPID `Authorization: vapid
   t=<JWT ES256>,k=<chave pública>` assinado corretamente e corpo cifrado
   `aes128gcm`.
2. **Tratamento de `WebPushException` com 410/404** — provado (seções 5a,
   5b): `exc.response.status_code` acessível e igual ao código HTTP real
   devolvido pelo servidor fake, para os dois códigos.
3. **Geração do par VAPID** — provado (seção 2): `vapid --gen` funciona,
   gera PEM válido, convertido com sucesso para o formato
   `applicationServerKey` que o navegador exige.
4. **Padrão "410/404 → apagar subscription" codificado e testado** — provado
   (seções 5a-5d): `if status_code in (404, 410): apagar` cobre os dois
   casos de expiração e NÃO dispara em 400 (erro não-relacionado) nem em 201
   (sucesso) — sem falso positivo nem falso negativo nos 4 cenários testados.
5. **Correção de versão** — a pesquisa de milestone citava `pywebpush==2.4.0`
   (inexistente no PyPI); o pin real e verificado é `pywebpush==2.1.2`.

**Ressalva única não fechada por este spike** (documentada, não bloqueante):
o limite prático de payload (~4 KB) e o comportamento de expiração
específico do Safari/iOS 16.4+ (endpoint real `web.push.apple.com`) só são
verificáveis contra o push service real do iPhone do dono — consistente com
o padrão já estabelecido no projeto de UAT explícito em hardware real (não é
gap deste spike, é limitação de ambiente de dev já documentada em
`STATE.md`/`PROJECT.md`).

## Artefatos do spike (não fazem parte do repo — ficam no scratchpad)

- `venv/` — ambiente isolado
- `private_key.pem` / `public_key.pem` — par VAPID de TESTE, descartável
- `fake_push_server.py` — servidor HTTP fake parametrizável por status code
- `fake_push_server_ok.py` — variante que devolve 201
- `spike_webpush_call.py` — chamador real do `webpush()` com captura de exceção
- `run_410.log`, `run_404.log`, `run_400.log`, `run_ok.log` — saídas literais
  de cada rodada
