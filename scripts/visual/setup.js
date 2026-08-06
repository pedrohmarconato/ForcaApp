// scripts/visual/setup.js
// `react-dom/server` (build browser) exige `MessageChannel`, que o ambiente do
// preset web do jest-expo não fornece. O polyfill abaixo é suficiente para
// `renderToStaticMarkup`, que é síncrono e nunca agenda nada por esse canal.
if (typeof globalThis.MessageChannel === 'undefined') {
  globalThis.MessageChannel = class {
    constructor() {
      const noop = () => {};
      this.port1 = { onmessage: null, postMessage: noop, close: noop, start: noop };
      this.port2 = { onmessage: null, postMessage: noop, close: noop, start: noop };
    }
  };
}

// `react-dom/server` também espera os codificadores do WHATWG, ausentes neste
// ambiente. Vêm do Node, sem dependência nova.
const { TextEncoder, TextDecoder } = require('util');
if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder;
if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder;
