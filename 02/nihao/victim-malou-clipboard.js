(() => {
  if (globalThis.VictimMalouClipboard) return;

  globalThis.VictimMalouClipboard = {
    buildPayload,
    write
  };

  function buildPayload(rows, includeHeader = true) {
    const textRows = [];
    const htmlRows = [];
    if (includeHeader) {
      textRows.push(["昵称", "ID", "头像"]);
      htmlRows.push("<tr><th>昵称</th><th>ID</th><th>头像</th></tr>");
    }

    rows.forEach((row) => {
      const nickname = String(row.nickname || "");
      const id = String(row.id || "");
      const imageData = String(row.avatarData || "");
      if (!imageData.startsWith("data:image/")) {
        throw new Error(`ID ${id || "未知"} 缺少真实头像数据`);
      }
      textRows.push([nickname, id, "[真实头像]"]);
      htmlRows.push(
        `<tr><td>${escapeHtml(nickname)}</td>`
        + `<td style="mso-number-format:'\\@'">${escapeHtml(id)}</td>`
        + `<td style="height:68px;width:76px;text-align:center">`
        + `<img src="${escapeAttribute(imageData)}" width="64" height="64" alt="头像" `
        + `style="display:block;width:64px;height:64px;object-fit:cover"></td></tr>`
      );
    });

    return {
      text: textRows.map((row) => row.join("\t")).join("\n"),
      html: `<!DOCTYPE html><html><body><table><tbody>${htmlRows.join("")}</tbody></table></body></html>`
    };
  }

  async function write(payload) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("当前浏览器不支持复制带图片的表格");
    }
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([payload.text], { type: "text/plain;charset=utf-8" }),
        "text/html": new Blob([payload.html], { type: "text/html;charset=utf-8" })
      })
    ]);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();
