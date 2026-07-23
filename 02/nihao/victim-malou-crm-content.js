(() => {
  if (globalThis.__victimMalouCrmContentLoaded) return;
  globalThis.__victimMalouCrmContentLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "victim-malou:collect-profile") return;
    void collectProfile(String(message.id || "")).then(
      (profile) => sendResponse({ ok: true, ...profile }),
      (error) => sendResponse({
        ok: false,
        error: String(error?.message || error || "页面资料提取失败")
      })
    );
    return true;
  });

  async function collectProfile(expectedId) {
    const pageId = location.pathname.split("/").filter(Boolean).pop() || "";
    if (pageId !== expectedId) {
      throw new Error("页面正在切换");
    }
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const profile = findProfile(expectedId);
      if (profile) return profile;
      await delay(120);
    }
    throw new Error(`未找到 ID ${expectedId} 的昵称和头像`);
  }

  function findProfile(expectedId) {
    const idPattern = new RegExp(`ID\\s*[:：]\\s*${escapeRegExp(expectedId)}(?:\\D|$)`, "i");
    const candidates = [...document.querySelectorAll("body *")]
      .filter((element) => element.children.length <= 5)
      .filter((element) => isVisible(element))
      .filter((element) => idPattern.test(normalizeText(element.textContent)));

    for (const candidate of candidates) {
      let container = candidate;
      for (let depth = 0; container && depth < 7; depth += 1, container = container.parentElement) {
        const image = container.querySelector("img");
        const text = normalizeText(container.innerText || container.textContent);
        if (!image || !text || text.length > 260 || !idPattern.test(text)) continue;

        const avatarUrl = image.currentSrc || image.src || image.getAttribute("src") || "";
        const nickname = extractNickname(text, expectedId, image.alt);
        if (!avatarUrl || !nickname) continue;
        return {
          id: expectedId,
          nickname,
          avatarUrl: new URL(avatarUrl, location.href).href
        };
      }
    }
    return null;
  }

  function extractNickname(text, id, imageAlt) {
    const cleaned = normalizeText(text)
      .replace(new RegExp(`ID\\s*[:：]\\s*${escapeRegExp(id)}`, "ig"), " ")
      .replace(/\bID\b/ig, " ")
      .trim();
    const pieces = cleaned
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => value !== id)
      .filter((value) => !/^(用户详情|用户搜索)$/.test(value));
    if (pieces[0]) return pieces[0];

    const alt = String(imageAlt || "").trim();
    return /^(头像|avatar|logo)$/i.test(alt) ? "" : alt;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden";
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
