// Captura reproduzível do harness visual em Chrome headless (viewport 390×844).
// Requer Chrome iniciado com --remote-debugging-port=9222 e o server.mjs ativo.

const [, , url, screenshotPath, action] = process.argv;
if (!url || !screenshotPath) {
  throw new Error("Uso: node harness/capture.mjs <url> <png>");
}

const target = await fetch(
  `http://localhost:9222/json/new?${encodeURIComponent(url)}`,
  {
    method: "PUT",
  },
).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const waiting = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  const resolve = waiting.get(message.id);
  if (resolve) {
    waiting.delete(message.id);
    resolve(message);
  }
});
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    waiting.set(id, (message) =>
      message.error
        ? reject(new Error(message.error.message))
        : resolve(message.result),
    );
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const result = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result.value;
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await new Promise((resolve) => setTimeout(resolve, 1800));

// Primeiro acesso do perfil isolado: autentica no stub com credenciais fake.
// Os eventos nativos preservam o caminho real do formulário React Native Web.
const beforeLogin = await evaluate("document.body.innerText");
if (beforeLogin.includes("Bem-vindo de volta.")) {
  await evaluate(`(() => {
    const setValue = (input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const [email, password] = document.querySelectorAll('input');
    setValue(email, 'demo@forca.app');
    setValue(password, 'demo123');
    [...document.querySelectorAll('button, [role="button"]')]
      .find((element) => element.getAttribute('aria-label') === 'Entrar')?.click();
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 2200));
}

if (action === "modal" || action === "modal-scroll") {
  await evaluate(
    `document.querySelector('[aria-label="Ver andamento do treino"]')?.click()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 400));
}
if (action === "modal-scroll") {
  const metrics = await evaluate(`(() => {
    const scrollers = [...document.querySelectorAll('*')]
      .filter((element) => element.scrollHeight > element.clientHeight + 1);
    const modalScroller = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (!modalScroller) return null;
    modalScroller.scrollTop = Math.floor(modalScroller.scrollHeight * 0.65);
    modalScroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    return { scrollHeight: modalScroller.scrollHeight, clientHeight: modalScroller.clientHeight, scrollTop: modalScroller.scrollTop };
  })()`);
  console.log(JSON.stringify({ modalScroll: metrics }));
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (action === "skip-rest") {
  await evaluate(
    `document.querySelector('[aria-label="Iniciar série"]')?.click()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 180));
  await evaluate(`(() => {
    const reps = document.querySelector('[aria-label="Repetições da série 2"]');
    const load = document.querySelector('[aria-label="Carga da série 2"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(reps, '8');
    reps.dispatchEvent(new Event('input', { bubbles: true }));
    reps.dispatchEvent(new Event('change', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(load, '40');
    load.dispatchEvent(new Event('input', { bubbles: true }));
    load.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 180));
  await evaluate(`([...document.querySelectorAll('*')]
    .find((element) => element.children.length === 0 && element.textContent?.trim() === 'Concluir série')?.click())`);
  await new Promise((resolve) => setTimeout(resolve, 450));
  await evaluate(
    `document.querySelector('[aria-label="Pular descanso"]')?.click()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const output = await evaluate(
  `(() => ({ text: document.body.innerText, inputs: [...document.querySelectorAll('input')].map((input) => ({ type: input.type, placeholder: input.placeholder, value: input.value })), buttons: [...document.querySelectorAll('button, [role="button"]')].map((element) => ({ tag: element.tagName, text: element.textContent?.trim(), label: element.getAttribute('aria-label') })), resources: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/auth/')) }))()`,
);
console.log(JSON.stringify(output));
const image = await cdp("Page.captureScreenshot", { format: "png" });
await import("node:fs/promises").then(({ writeFile }) =>
  writeFile(screenshotPath, image.data, "base64"),
);
socket.close();
