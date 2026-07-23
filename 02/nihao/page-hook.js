"use strict";
(() => {
  // src/page-hook/index.ts
  var MARK = "__shunfenger_hook_installed__";
  var EVENT_SOURCE = "shunfenger-page-hook";
  var MAX_BODY_LENGTH = 25e4;
  if (!window[MARK]) {
    window[MARK] = true;
    installFetchHook();
    installXhrHook();
    installWebSocketHook();
    installSocketObjectHook();
  }
  function shouldCapture(url) {
    return /tool\.miaokol\.com|^\/api\//.test(url) && /\/api\/|latestChatMembers|wxid|teacher|staff|account|kefu|客服|老师|班主任/i.test(url);
  }
  function publish(url, bodyText) {
    if (!bodyText || bodyText.length > MAX_BODY_LENGTH) return;
    window.postMessage(
      {
        source: EVENT_SOURCE,
        type: "api-response",
        url,
        bodyText
      },
      window.location.origin
    );
  }
  function installWebSocketHook() {
    const OriginalWebSocket = window.WebSocket;
    if (!OriginalWebSocket) return;
    window.WebSocket = new Proxy(OriginalWebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args);
        const url = String(args[0] || "websocket");
        socket.addEventListener("message", (event) => {
          if (typeof event.data === "string" && /rcvMsg|msg|message|content|wxid|chat/i.test(event.data)) {
            publish(`websocket:${url}`, event.data);
          }
        });
        return socket;
      }
    });
  }
  function installSocketObjectHook() {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const socket = window.socket;
      if (socket?.on && !socket.__shunfengerOnWrapped) {
        const originalOn = socket.on.bind(socket);
        socket.on = (event, handler) => {
          const wrapped = (...args) => {
            if (/rcvMsg|msg|message|chat|userInfo/i.test(event)) {
              publish(`socket-event:${event}`, JSON.stringify({ event, args }));
            }
            return handler(...args);
          };
          return originalOn(event, wrapped);
        };
        socket.__shunfengerOnWrapped = true;
        window.clearInterval(timer);
      }
      if (attempts > 120) window.clearInterval(timer);
    }, 500);
  }
  function installFetchHook() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = resolveFetchUrl(args[0]);
      if (shouldCapture(url)) {
        response.clone().text().then((text) => publish(url, text)).catch(() => void 0);
      }
      return response;
    };
  }
  function installXhrHook() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__shunfengerUrl = String(url);
      return originalOpen.apply(this, [method, url, ...rest]);
    };
    XMLHttpRequest.prototype.send = function patchedSend(...args) {
      this.addEventListener("load", () => {
        const url = this.__shunfengerUrl || "";
        if (!shouldCapture(url)) return;
        if (typeof this.responseText === "string") publish(url, this.responseText);
      });
      return originalSend.apply(this, args);
    };
  }
  function resolveFetchUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url;
  }
})();
