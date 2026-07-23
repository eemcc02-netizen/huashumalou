(() => {
  if (globalThis.__victimMalouTencentContentLoaded) return;
  globalThis.__victimMalouTencentContentLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "victim-malou:write-table") return;
    void writeTable(message.rows || [], message.includeHeader !== false).then(
      (result) => sendResponse({ ok: true, ...result }),
      (error) => sendResponse({
        ok: false,
        error: String(error?.message || error || "腾讯文档写入失败")
      })
    );
    return true;
  });

  async function writeTable(rows, includeHeader) {
    if (!rows.length) throw new Error("没有可写入的数据");
    const clipboardModule = globalThis.VictimMalouClipboard;
    if (!clipboardModule) throw new Error("复制全部模块未加载");
    const payload = clipboardModule.buildPayload(rows, includeHeader);
    const clipboardReady = await clipboardModule.write(payload).then(() => true, () => false);
    const directHandled = dispatchPaste(payload);
    return {
      directHandled,
      clipboardReady,
      count: rows.length
    };
  }

  function dispatchPaste(payload) {
    const target = document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : document.querySelector('[contenteditable="true"]')
        || document.querySelector("canvas")
        || document.body;
    const transfer = new DataTransfer();
    transfer.setData("text/plain", payload.text);
    transfer.setData("text/html", payload.html);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clipboardData: transfer
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

})();
