export async function writeVictimsToTencentDocs(rows, options = {}) {
  const validRows = rows.filter((row) => row?.ok && row.avatarData);
  if (!validRows.length) throw new Error("没有可写入的成功记录");

  const tabs = await chrome.tabs.query({ url: "https://docs.qq.com/*" });
  if (!tabs.length) throw new Error("请先打开一个腾讯文档在线表格");
  const targetTab = [...tabs].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];

  await chrome.tabs.update(targetTab.id, { active: true });
  if (targetTab.windowId) {
    await chrome.windows.update(targetTab.windowId, { focused: true });
  }
  await delay(450);

  const response = await chrome.tabs.sendMessage(targetTab.id, {
    type: "victim-malou:write-table",
    includeHeader: options.includeHeader !== false,
    rows: validRows.map((row) => ({
      nickname: row.nickname,
      id: row.id,
      avatarData: row.avatarData,
      avatarMime: row.avatarMime || "image/png"
    }))
  });

  if (!response?.ok) throw new Error(response?.error || "腾讯文档写入失败");
  return response;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
