(() => {
  const Z_INDEX_TOP = 2147483647;

  function ensurePanel(uiState) {
    if (uiState.host) return;
    const host = document.createElement("div");
    host.id = "tb-completion-host";
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.zIndex = String(Z_INDEX_TOP);
    const shadow = host.attachShadow({ mode: "open" });
    const panel = document.createElement("div");
    panel.style.overflowY = "auto";
    panel.style.background = "linear-gradient(180deg, rgba(19,12,37,0.96), rgba(7,6,16,0.98))";
    panel.style.color = "#f4ecff";
    panel.style.border = "1px solid rgba(168, 85, 247, 0.35)";
    panel.style.borderRadius = "16px";
    panel.style.boxShadow = "0 18px 42px rgba(20, 10, 40, 0.55), inset 0 1px 0 rgba(255,255,255,0.08)";
    panel.style.backdropFilter = "blur(18px)";
    panel.style.font = "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif";
    panel.style.padding = "6px";
    shadow.appendChild(panel);
    document.documentElement.appendChild(host);
    uiState.host = host;
    uiState.panel = panel;
  }

  function applyPanelStyles(uiState, settings, clampNumber) {
    if (!uiState.panel) return;
    const width = clampNumber(settings.suggestionWidth, 220, 560, 360);
    const height = clampNumber(settings.suggestionHeight, 120, 560, 280);
    const fontSize = clampNumber(settings.suggestionFontSize, 12, 22, 13);
    const opacity = clampNumber(settings.suggestionOpacity, 40, 100, 96);
    const removeHue = settings.suggestionRemoveHue === true;
    uiState.panel.style.width = `${width}px`;
    uiState.panel.style.maxHeight = `${height}px`;
    uiState.panel.style.fontSize = `${fontSize}px`;
    uiState.panel.style.lineHeight = "1.4";
    uiState.panel.style.opacity = `${opacity / 100}`;
    uiState.panel.style.filter = removeHue ? "saturate(0)" : "none";
  }

  function renderSuggestionList(uiState, settings, escapeHtml, onApplySnippet) {
    const panel = uiState.panel;
    if (!panel) return;
    panel.innerHTML = "";
    uiState.suggestions.forEach((item, index) => {
      const isSelectable = item.selectable !== false;
      const isActive = index === uiState.activeIndex;
      const row = document.createElement("div");
      row.dataset.index = String(index);
      row.style.padding = item.kind === "ai" ? (isActive ? "9px 10px" : "8px 10px") : "6px 10px";
      row.style.borderRadius = "12px";
      row.style.cursor = isSelectable ? "pointer" : "default";
      row.style.marginBottom = "4px";
      row.style.background = isActive
        ? "linear-gradient(135deg, rgba(124,58,237,0.34), rgba(59,130,246,0.18))"
        : "rgba(255,255,255,0.03)";
      row.style.border = isActive
        ? "1px solid rgba(192, 132, 252, 0.62)"
        : "1px solid rgba(255,255,255,0.06)";
      row.style.opacity = isSelectable ? "1" : ".72";
      row.style.boxShadow = isActive ? "0 8px 24px rgba(124,58,237,0.18)" : "none";
      if (item.kind === "ai") {
        row.innerHTML =
          `<div style="font-weight:${isActive ? "700" : "600"}; color:#faf5ff; line-height:1.5; white-space:pre-wrap; word-break:break-word;">${escapeHtml(buildAiText(item))}</div>`;
      } else if (!item.kind || item.kind === "snippet") {
        const shortcut = formatShortcut(item.shortcut || item.title);
        const preview = buildSnippetDisplayText(item, settings);
        const isImage = item.type === "image";
        const imageThumb = isImage && item.imageData
          ? `<img src="${escapeHtml(item.imageData)}" alt="" style="width:28px; height:28px; flex:0 0 auto; object-fit:cover; border-radius:7px; border:1px solid rgba(255,255,255,0.12); background:rgba(0,0,0,0.2);" />`
          : "";
        const typeLabel = isImage
          ? `<div style="flex:0 0 auto; padding:1px 7px; border-radius:999px; font-size:11px; font-weight:700; color:#fecdd3; background:rgba(244,63,94,0.13); border:1px solid rgba(255,255,255,0.08);">图片</div>`
          : "";
        row.innerHTML =
          `<div style="display:flex; align-items:center; gap:10px; min-width:0;">` +
            `<div style="flex:0 0 auto; padding:1px 7px; border-radius:999px; font-size:11px; font-weight:700; color:#d8b4fe; background:rgba(168,85,247,0.14); border:1px solid rgba(255,255,255,0.08);">${escapeHtml(shortcut || "未命名")}</div>` +
            `${typeLabel}` +
            `${imageThumb}` +
            `<div style="min-width:0; flex:1; color:${isActive ? "#f5edff" : "#d6d3e6"}; opacity:${isActive ? "0.98" : "0.82"}; font-size:12px; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(preview)}</div>` +
          `</div>`;
      } else {
        const preview = isActive ? buildPreviewText(item, settings) : "";
        const meta = buildCompactMeta(item, isActive);
        const showKindTag = shouldShowKindTag(item, isActive);
        row.innerHTML =
          `<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">` +
            `<div style="min-width:0; flex:1;">` +
              `<div style="min-width:0; flex:1; font-weight:700; letter-spacing:.02em; color:#faf5ff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.title || "未命名")}</div>` +
              `${meta ? `<div style="opacity:${isActive ? ".88" : ".74"}; color:${isActive ? "#d8b4fe" : "#b8b4c7"}; margin-top:3px; font-size:.9em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(meta)}</div>` : ""}` +
              `${preview ? `<div style="margin-top:4px; color:#d6d3e6; opacity:.82; font-size:.88em; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(preview)}</div>` : ""}` +
            `</div>` +
            `${showKindTag ? `<div style="flex:0 0 auto; padding:2px 7px; border-radius:999px; font-size:10px; font-weight:700; color:${getKindColor(item)}; background:${getKindBackground(item)}; border:1px solid rgba(255,255,255,0.08);">${escapeHtml(getKindLabel(item))}</div>` : ""}` +
          `</div>`;
      }
      if (isSelectable) {
        let applied = false;
        const handleApply = async (event) => {
          if (applied) return;
          applied = true;
          event.preventDefault();
          event.stopPropagation();
          uiState.activeIndex = index;
          await onApplySnippet(item);
        };
        row.addEventListener("mouseenter", () => {
          uiState.activeIndex = index;
          renderSuggestionList(uiState, settings, escapeHtml, onApplySnippet);
        });
        row.addEventListener("pointerdown", handleApply);
        row.addEventListener("click", handleApply);
      }
      panel.appendChild(row);
    });
    syncActiveRowIntoView(panel, uiState.activeIndex);
  }

  function showPanel(uiState) {
    uiState.visible = true;
    if (uiState.host) {
      uiState.host.style.display = "block";
    }
  }

  function hidePanel(uiState) {
    uiState.visible = false;
    uiState.context = null;
    uiState.suggestions = [];
    if (uiState.host) {
      uiState.host.style.display = "none";
    }
  }

  function positionPanel(uiState, target, settings, clampNumber) {
    if (!uiState.host || !uiState.panel) return;
    const context = target && target.target ? target : { target };
    const anchor = context && context.anchorPoint ? context.anchorPoint : getFallbackAnchor(context.target);
    const width = clampNumber(settings.suggestionWidth, 220, 560, 360);
    const configuredHeight = clampNumber(settings.suggestionHeight, 120, 560, 280);
    const offsetX = clampNumber(settings.suggestionOffsetX, -160, 160, 0);
    const offsetY = clampNumber(settings.suggestionOffsetY, -40, 120, 10);
    const expandDirection = ["auto", "prefer-up", "always-up", "always-down"].includes(settings.suggestionExpandDirection)
      ? settings.suggestionExpandDirection
      : "prefer-up";
    const viewportPadding = 8;
    const desiredHeight = Math.min(configuredHeight, Math.max(88, uiState.panel.scrollHeight || configuredHeight));
    const spaceBelow = window.innerHeight - anchor.y - offsetY - viewportPadding;
    const spaceAbove = anchor.y - offsetY - viewportPadding;
    const minPreferredHeight = 120;
    const placeAbove = shouldPlaceAbove(expandDirection, spaceAbove, spaceBelow, minPreferredHeight);
    const availableSpace = placeAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(configuredHeight, Math.max(96, availableSpace));
    const actualHeight = Math.min(maxHeight, desiredHeight);
    const top = placeAbove
      ? Math.max(viewportPadding, anchor.y - offsetY - actualHeight)
      : Math.max(viewportPadding, anchor.y + offsetY);
    const left = Math.min(
      window.innerWidth - width - viewportPadding,
      Math.max(viewportPadding, anchor.x + offsetX)
    );

    uiState.panel.style.maxHeight = `${maxHeight}px`;
    uiState.host.style.left = `${left}px`;
    uiState.host.style.top = `${top}px`;
  }

  function shouldPlaceAbove(mode, spaceAbove, spaceBelow, minPreferredHeight) {
    if (mode === "always-up") return true;
    if (mode === "always-down") return false;
    if (mode === "auto") return spaceAbove > spaceBelow;
    return spaceAbove >= minPreferredHeight || spaceAbove >= spaceBelow;
  }

  function buildPreviewText(item, settings) {
    if (item.type === "image") {
      return `[图片] ${item.imageName || "未命名图片"}`;
    }
    const raw = String(item.content || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    if (raw === item.title) return raw.slice(0, getSnippetPreviewLength(settings));
    return raw.slice(0, Math.max(18, getSnippetPreviewLength(settings) * 2));
  }

  function buildSnippetPreviewText(item, settings) {
    if (item.type === "image") {
      const raw = `[图片] ${item.imageName || "未命名图片"}`;
      const limit = Math.max(8, getSnippetPreviewLength(settings));
      return raw.slice(0, Math.max(limit, 18));
    }
    const raw = String(item.content || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    const limit = getSnippetPreviewLength(settings);
    if (limit <= 0) return "";
    return raw.slice(0, limit);
  }

  function buildSnippetTitleText(item, settings) {
    const raw = String(item.title || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    const limit = getSnippetPreviewLength(settings);
    if (limit <= 0) return "";
    return raw.slice(0, limit);
  }

  function buildSnippetDisplayText(item, settings) {
    const mode = getSnippetDisplayMode(settings);
    const title = buildSnippetTitleText(item, settings);
    const preview = buildSnippetPreviewText(item, settings);
    if (mode === "title") {
      return title || preview || "";
    }
    if (mode === "both") {
      if (title && preview && title !== preview) return `${title} · ${preview}`;
      return title || preview || "";
    }
    return preview || title || "";
  }

  function buildAiText(item) {
    return String(item.content || item.title || "").trim();
  }

  function getSnippetPreviewLength(settings) {
    const num = Number(settings && settings.suggestionSnippetPreviewLength);
    if (!Number.isFinite(num)) return 10;
    return Math.max(0, Math.min(30, Math.round(num)));
  }

  function getSnippetDisplayMode(settings) {
    const mode = String(settings && settings.suggestionSnippetDisplayMode || "");
    return ["title", "content", "both"].includes(mode) ? mode : "content";
  }

  function syncActiveRowIntoView(panel, activeIndex) {
    if (!panel || activeIndex < 0) return;
    const activeRow = panel.querySelector(`[data-index="${activeIndex}"]`);
    if (!activeRow) return;
    const rowTop = activeRow.offsetTop;
    const rowBottom = rowTop + activeRow.offsetHeight;
    const viewTop = panel.scrollTop;
    const viewBottom = viewTop + panel.clientHeight;
    if (rowTop < viewTop) {
      panel.scrollTop = Math.max(0, rowTop - 6);
      return;
    }
    if (rowBottom > viewBottom) {
      panel.scrollTop = Math.max(0, rowBottom - panel.clientHeight + 6);
    }
  }

  function buildCompactMeta(item, isActive) {
    if (item.kind === "system") {
      return item.category || item.shortcut || "";
    }
    if (item.kind === "ai-command") {
      return [item.category || "", isActive ? "回车执行" : ""].filter(Boolean).join(" · ");
    }
    if (item.kind === "ai") {
      return [item.category || "", isActive ? "回车填入" : ""].filter(Boolean).join(" · ");
    }
    return [item.category || "", isActive && item.useCount ? `热度 ${item.useCount}` : ""].filter(Boolean).join(" · ");
  }

  function formatShortcut(shortcut) {
    const value = String(shortcut || "").trim();
    if (!value) return "";
    return value.startsWith("/") ? value : `/${value}`;
  }

  function shouldShowKindTag(item, isActive) {
    if (item.kind === "system" || item.kind === "ai-command") return true;
    if (item.kind === "ai") return isActive;
    return false;
  }

  function getKindLabel(item) {
    if (item.kind === "ai") return "AI";
    if (item.kind === "ai-command") return "指令";
    if (item.kind === "system") return "提示";
    if (item.type === "image") return "图片";
    return "话术";
  }

  function getKindColor(item) {
    if (item.kind === "ai") return "#67e8f9";
    if (item.kind === "ai-command") return "#f0abfc";
    if (item.kind === "system") return "#cbd5e1";
    return "#d8b4fe";
  }

  function getKindBackground(item) {
    if (item.kind === "ai") return "rgba(34,211,238,0.14)";
    if (item.kind === "ai-command") return "rgba(217,70,239,0.14)";
    if (item.kind === "system") return "rgba(148,163,184,0.14)";
    return "rgba(168,85,247,0.14)";
  }

  function getFallbackAnchor(target) {
    if (target instanceof HTMLElement) {
      const rect = target.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top
      };
    }
    return {
      x: viewportWidth() * 0.5,
      y: viewportHeight() * 0.5
    };
  }

  function viewportWidth() {
    return window.innerWidth || document.documentElement.clientWidth || 0;
  }

  function viewportHeight() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }

  window.NihaoPanel = {
    ensurePanel,
    applyPanelStyles,
    renderSuggestionList,
    showPanel,
    hidePanel,
    positionPanel
  };
})();
