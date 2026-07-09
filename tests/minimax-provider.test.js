import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const providerCode = fs.readFileSync(path.resolve(__dirname, "..", "ai.minimax.js"), "utf8");
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(providerCode, sandbox);
const provider = sandbox.module.exports;

function run() {
  const endpointMiniMax = provider.normalizeBaseUrl(
    "https://api.minimaxi.com/v1",
    "openai",
    "minimax-cn"
  );
  assert.strictEqual(endpointMiniMax, "https://api.minimaxi.com/v1/chat/completions");
  const endpointMiniMaxAnthropic = provider.normalizeBaseUrl(
    "https://api.minimaxi.com/anthropic",
    "anthropic",
    "minimax-cn"
  );
  assert.strictEqual(endpointMiniMaxAnthropic, "https://api.minimaxi.com/anthropic/v1/messages");

  const endpointDeepSeek = provider.normalizeBaseUrl(
    "https://api.deepseek.com",
    "openai",
    "deepseek"
  );
  assert.strictEqual(endpointDeepSeek, "https://api.deepseek.com/chat/completions");

  const endpointVolc = provider.normalizeBaseUrl(
    "https://ark.cn-beijing.volces.com/api/v3",
    "openai",
    "volcengine"
  );
  assert.strictEqual(endpointVolc, "https://ark.cn-beijing.volces.com/api/v3/chat/completions");

  const req = provider.buildRequest(
    {
      apiFormat: "openai",
      apiHostPreset: "minimax-cn",
      apiBaseUrl: "https://api.minimaxi.com/v1",
      apiKey: "test-key",
      model: "MiniMax-M2.7",
      systemPrompt: "sys"
    },
    "hello"
  );
  assert.strictEqual(req.endpoint, "https://api.minimaxi.com/v1/chat/completions");
  const body = JSON.parse(req.requestInit.body);
  assert.strictEqual(body.model, "MiniMax-M2.7");
  assert.strictEqual(body.messages[1].content, "hello");
  assert.ok(body.extra_body);

  const candidates = provider.getCandidateEndpoints({
    apiFormat: "openai",
    apiHostPreset: "minimax-cn",
    apiBaseUrl: "https://api.minimaxi.com/v1"
  });
  assert.ok(candidates.includes("https://api.minimaxi.com/v1/chat/completions"));
  assert.ok(candidates.includes("https://api.minimaxi.com/v1/text/chatcompletion_v2"));

  const deepseekAnthropicReq = provider.buildRequest(
    {
      apiFormat: "anthropic",
      apiHostPreset: "deepseek",
      apiBaseUrl: "https://api.deepseek.com/anthropic",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
      systemPrompt: "sys"
    },
    "hello"
  );
  assert.strictEqual(deepseekAnthropicReq.endpoint, "https://api.deepseek.com/anthropic/v1/messages");
  const anthropicBody = JSON.parse(deepseekAnthropicReq.requestInit.body);
  assert.strictEqual(anthropicBody.messages[0].content[0].text, "hello");

  const parsed = Array.from(provider.parseSuggestions("1. 你好\n2. 请稍等\n- 感谢", 2));
  assert.deepStrictEqual(parsed, ["你好", "请稍等"]);
  const parsedThink = Array.from(provider.parseSuggestions(
    "1. <think>用户让我作为客服助手</think>\n2. 上下文：\n3. 我：推荐课程\n4. 您好，已为您整理好课程方案。",
    3
  ));
  assert.deepStrictEqual(parsedThink, ["您好，已为您整理好课程方案。"]);

  const textAnthropic = provider.parseResponseText("anthropic", {
    content: [{ type: "text", text: "建议A" }]
  });
  assert.strictEqual(textAnthropic, "建议A");

  const textOpenAIArray = provider.parseResponseText("openai", {
    choices: [{ message: { content: [{ type: "text", text: "建议C" }] } }]
  });
  assert.strictEqual(textOpenAIArray, "建议C");

  const textOpenAI = provider.parseResponseText("openai", {
    choices: [{ message: { content: "建议B" } }]
  });
  assert.strictEqual(textOpenAI, "建议B");
}

run();
console.log("minimax-provider tests passed");
