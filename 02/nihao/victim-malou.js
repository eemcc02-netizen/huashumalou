import { parseVictimIds, VictimMalouCollector } from "./victim-malou-collector.js";
import { writeVictimsToTencentDocs } from "./victim-malou-tencent-writer.js";

const elements = {
  idInput: document.getElementById("id-input"),
  idCount: document.getElementById("id-count"),
  concurrency: document.getElementById("concurrency-select"),
  includeHeader: document.getElementById("include-header"),
  start: document.getElementById("start-button"),
  stop: document.getElementById("stop-button"),
  copyAll: document.getElementById("copy-all-button"),
  writeDocs: document.getElementById("write-docs-button"),
  clear: document.getElementById("clear-button"),
  runState: document.getElementById("run-state"),
  progressBar: document.getElementById("progress-bar"),
  total: document.getElementById("total-count"),
  success: document.getElementById("success-count"),
  failed: document.getElementById("failed-count"),
  pending: document.getElementById("pending-count"),
  message: document.getElementById("status-message"),
  resultBody: document.getElementById("result-body")
};

let collector = null;
let results = [];
let running = false;

elements.idInput.addEventListener("input", updateIdCount);
elements.start.addEventListener("click", startCollection);
elements.stop.addEventListener("click", stopCollection);
elements.copyAll.addEventListener("click", copyAllRows);
elements.writeDocs.addEventListener("click", writeToTencentDocs);
elements.clear.addEventListener("click", clearResults);

updateIdCount();
renderResults();

async function startCollection() {
  if (running) return;
  const ids = parseVictimIds(elements.idInput.value);
  if (!ids.length) {
    setMessage("请输入至少一个纯数字用户 ID。", "error");
    return;
  }
  const concurrency = Math.max(
    1,
    Math.min(10, Math.round(Number(elements.concurrency.value) || 2))
  );
  elements.concurrency.value = String(concurrency);

  running = true;
  results = new Array(ids.length);
  collector = new VictimMalouCollector();
  setRunningUi(true);
  updateMetrics({ total: ids.length, completed: 0, success: 0, failed: 0 });
  renderResults();
  setState("正在采集", "running");
  setMessage(`正在按 ${concurrency} 个并发页面采集，请保持登录状态。`);

  try {
    const collected = await collector.collect(ids, {
      concurrency,
      onResult: (result, index) => {
        results[index] = result;
        renderResults();
      },
      onProgress: updateMetrics
    });
    results = collected;
    if (collector.cancelled) {
      setState("已停止", "error");
      setMessage("采集已停止，已完成的记录仍可使用。");
    } else {
      const successCount = results.filter((item) => item?.ok).length;
      setState("采集完成", "done");
      setMessage(`完成 ${results.length} 条任务，其中成功 ${successCount} 条。`);
    }
  } catch (error) {
    setState("采集异常", "error");
    setMessage(String(error?.message || error || "采集失败"), "error");
  } finally {
    running = false;
    collector = null;
    setRunningUi(false);
    updateActionButtons();
  }
}

async function stopCollection() {
  if (!collector) return;
  elements.stop.disabled = true;
  setMessage("正在停止任务并关闭临时页面...");
  await collector.cancel();
}

async function copyAllRows() {
  const validRows = results.filter((row) => row?.ok && row.avatarData);
  if (!validRows.length) return;
  try {
    const payload = globalThis.VictimMalouClipboard.buildPayload(
      validRows,
      elements.includeHeader.checked
    );
    await globalThis.VictimMalouClipboard.write(payload);
    setMessage(`已复制 ${validRows.length} 条昵称、ID 和真实头像，可直接粘贴到腾讯文档。`);
  } catch (error) {
    setMessage(String(error?.message || error || "复制全部失败"), "error");
  }
}

async function writeToTencentDocs() {
  elements.writeDocs.disabled = true;
  setMessage("正在切换到腾讯文档并写入，请勿切换页面...");
  try {
    const response = await writeVictimsToTencentDocs(results, {
      includeHeader: elements.includeHeader.checked
    });
    if (response.directHandled) {
      setMessage(`已向腾讯文档触发写入，共 ${response.count} 条。`);
    } else if (response.clipboardReady) {
      setMessage("腾讯文档未确认自动粘贴，数据已放入剪贴板，请在当前单元格按 Ctrl+V。", "error");
    } else {
      throw new Error("腾讯文档没有接收粘贴，剪贴板写入也失败");
    }
  } catch (error) {
    setMessage(String(error?.message || error || "写入腾讯文档失败"), "error");
  } finally {
    updateActionButtons();
  }
}

function clearResults() {
  if (running) return;
  results = [];
  updateMetrics({ total: 0, completed: 0, success: 0, failed: 0 });
  setState("等待开始", "idle");
  setMessage("输入 ID 后即可开始。");
  renderResults();
}

function updateIdCount() {
  elements.idCount.textContent = `${parseVictimIds(elements.idInput.value).length} 个`;
}

function updateMetrics(progress) {
  const total = Number(progress.total || 0);
  const completed = Number(progress.completed || 0);
  elements.total.textContent = String(total);
  elements.success.textContent = String(progress.success || 0);
  elements.failed.textContent = String(progress.failed || 0);
  elements.pending.textContent = String(Math.max(0, total - completed));
  elements.progressBar.style.width = total ? `${Math.round((completed / total) * 100)}%` : "0%";
}

function renderResults() {
  const visibleResults = results.filter(Boolean);
  if (!visibleResults.length) {
    elements.resultBody.innerHTML = '<tr class="empty-row"><td colspan="5">暂无采集结果</td></tr>';
    updateActionButtons();
    return;
  }

  elements.resultBody.innerHTML = visibleResults.map((row, index) => {
    const avatar = row.ok && row.avatarData
      ? `<img class="avatar" src="${escapeAttribute(row.avatarData)}" alt="${escapeAttribute(row.nickname)}">`
      : '<span class="row-status failed">--</span>';
    const status = row.ok
      ? '<span class="row-status">采集成功</span>'
      : `<span class="row-status failed">${escapeHtml(row.error || "采集失败")}</span>`;
    return `<tr>
      <td>${index + 1}</td>
      <td>${avatar}</td>
      <td>${escapeHtml(row.nickname || "--")}</td>
      <td>${escapeHtml(row.id || "--")}</td>
      <td>${status}</td>
    </tr>`;
  }).join("");
  updateActionButtons();
}

function updateActionButtons() {
  const hasSuccess = results.some((row) => row?.ok);
  elements.copyAll.disabled = running || !hasSuccess;
  elements.writeDocs.disabled = running || !hasSuccess;
  elements.clear.disabled = running;
}

function setRunningUi(isRunning) {
  elements.start.disabled = isRunning;
  elements.stop.disabled = !isRunning;
  elements.idInput.disabled = isRunning;
  elements.concurrency.disabled = isRunning;
}

function setState(text, className) {
  elements.runState.textContent = text;
  elements.runState.className = `state-badge ${className}`;
}

function setMessage(text, type = "") {
  elements.message.textContent = text;
  elements.message.style.color = type === "error" ? "var(--danger)" : "";
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
