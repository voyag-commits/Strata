import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/server.js";
const baseConfig = {
    deepSeekApiKey: "unit-redacted-deepseek-key",
    bridgeAuthKey: "proxy-redacted-token",
    deepSeekBaseUrl: "https://api.deepseek.com",
    deepSeekModel: "deepseek-v4-pro",
    advertisedModels: ["deepseek-v4-pro", "deepseek-v4-flash"],
    forceModel: false,
    enableThinking: false,
    upstreamTimeoutMs: 120000,
    port: 38441,
};
function bearer(token) {
    return `${"Bearer"} ${token}`;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
test("/health works without proxy auth", async () => {
    const app = createApp({ config: baseConfig, fetchFn: async () => new Response("{}") });
    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "ok");
    await app.close();
});
test("/v1/models works with proxy auth", async () => {
    const app = createApp({ config: baseConfig, fetchFn: async () => new Response("{}") });
    const response = await app.inject({ method: "GET", url: "/v1/models", headers: { authorization: bearer(baseConfig.bridgeAuthKey) } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().data.map((model) => model.id), ["deepseek-v4-pro", "deepseek-v4-flash"]);
    await app.close();
});
test("POST /v1/responses performs non-streaming upstream call and response conversion", async () => {
    let upstreamBody;
    let upstreamAuth = "";
    const app = createApp({
        config: baseConfig,
        fetchFn: async (_input, init) => {
            upstreamBody = JSON.parse(String(init?.body));
            upstreamAuth = String((init?.headers).authorization);
            return new Response(JSON.stringify({
                id: "chatcmpl_test",
                created: 100,
                model: "deepseek-v4-pro",
                choices: [{ message: { role: "assistant", content: "Hello." }, finish_reason: "stop" }],
            }), { status: 200, headers: { "content-type": "application/json" } });
        },
    });
    const response = await app.inject({
        method: "POST",
        url: "/v1/responses",
        headers: { authorization: bearer(baseConfig.bridgeAuthKey) },
        payload: { model: "deepseek-v4-pro", instructions: "You are terse.", input: "Say hello.", max_output_tokens: 10, stream: false },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(upstreamAuth, bearer(baseConfig.deepSeekApiKey));
    assert.equal(upstreamBody.max_tokens, 10);
    assert.equal(upstreamBody.messages[0].role, "system");
    assert.equal(upstreamBody.messages[1].content, "Say hello.");
    assert.equal(response.json().output[0].content[0].text, "Hello.");
    await app.close();
});
test("POST /v1/responses maps upstream error to OpenAI-style error JSON", async () => {
    const app = createApp({
        config: baseConfig,
        fetchFn: async () => new Response(JSON.stringify({ error: { message: "rate limited", code: "rate_limit" } }), { status: 429 }),
    });
    const response = await app.inject({
        method: "POST",
        url: "/v1/responses",
        headers: { authorization: bearer(baseConfig.bridgeAuthKey) },
        payload: { input: "Hi" },
    });
    assert.equal(response.statusCode, 429);
    assert.equal(response.json().error.type, "upstream_request_error");
    assert.equal(response.json().error.message, "rate limited");
    await app.close();
});
test("streaming DeepSeek chunks -> Responses SSE events", async () => {
    const encoder = new TextEncoder();
    const upstreamStream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"role":"assistant"},"index":0}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel"},"index":0}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"lo"},"index":0,"finish_reason":"stop"}]}\n\n'));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });
    const app = createApp({
        config: baseConfig,
        fetchFn: async () => new Response(upstreamStream, { status: 200, headers: { "content-type": "text/event-stream" } }),
    });
    const response = await app.inject({
        method: "POST",
        url: "/v1/responses",
        headers: { authorization: bearer(baseConfig.bridgeAuthKey) },
        payload: { model: "deepseek-v4-pro", input: "Say hello.", stream: true },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.payload, /event: response.created/);
    assert.match(response.payload, /event: response.output_text.delta/);
    assert.match(response.payload, /"delta":"Hel"/);
    assert.match(response.payload, /event: response.completed/);
    assert.match(response.payload, /data: \[DONE\]/);
    await app.close();
});
test("streaming DeepSeek tool-call chunks -> Responses function-call events", async () => {
    const encoder = new TextEncoder();
    const upstreamStream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":""}}]},"index":0}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":"}}]},"index":0}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.ts\\"}"}}]},"index":0,"finish_reason":"tool_calls"}]}\n\n'));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });
    const app = createApp({
        config: baseConfig,
        fetchFn: async () => new Response(upstreamStream, { status: 200, headers: { "content-type": "text/event-stream" } }),
    });
    const response = await app.inject({
        method: "POST",
        url: "/v1/responses",
        headers: { authorization: bearer(baseConfig.bridgeAuthKey) },
        payload: { model: "deepseek-v4-pro", input: "Read a file.", stream: true },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.payload, /event: response.output_item.added/);
    assert.match(response.payload, /"type":"function_call"/);
    assert.match(response.payload, /event: response.function_call_arguments.delta/);
    assert.match(response.payload, /event: response.function_call_arguments.done/);
    assert.match(response.payload, /"arguments":"\{\\?"path\\?":\\?"a\.ts\\?"\}"/);
    await app.close();
});
test("proxy auth rejects missing Authorization when BRIDGE_AUTH_KEY is configured", async () => {
    const app = createApp({ config: baseConfig, fetchFn: async () => new Response("{}") });
    const response = await app.inject({ method: "GET", url: "/v1/models" });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.type, "authentication_error");
    await app.close();
});
test("POST /v1/responses returns 504 on upstream timeout", async () => {
    const app = createApp({
        config: { ...baseConfig, upstreamTimeoutMs: 20 },
        fetchFn: async (_input, init) => new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal)
                return;
            signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    const response = await app.inject({
        method: "POST",
        url: "/v1/responses",
        headers: { authorization: bearer(baseConfig.bridgeAuthKey) },
        payload: { input: "Hi" },
    });
    assert.equal(response.statusCode, 504);
    assert.equal(response.json().error.code, "upstream_timeout");
    await app.close();
});
test("debug trace writes redacted request and response payloads", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-debug-"));
    const app = createApp({
        config: { ...baseConfig, debugTraceDir: tempDir },
        fetchFn: async () => new Response(JSON.stringify({
            id: "chatcmpl_debug",
            model: "deepseek-v4-pro",
            choices: [{ message: { role: "assistant", content: "debug ok" }, finish_reason: "stop" }],
        }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    const metadataSecret = `${"s"}k-UNITREDACTEDSECRET`;
    const response = await app.inject({
        method: "POST",
        url: "/v1/responses",
        headers: { authorization: bearer(baseConfig.bridgeAuthKey) },
        payload: { input: "Hi", metadata: { api_key: metadataSecret } },
    });
    assert.equal(response.statusCode, 200);
    const files = fs.readdirSync(tempDir).sort();
    assert.ok(files.some((file) => file.endsWith(".request.json")));
    assert.ok(files.some((file) => file.endsWith(".response.json")));
    const combined = files.map((file) => fs.readFileSync(`${tempDir}/${file}`, "utf8")).join("\n");
    assert.doesNotMatch(combined, new RegExp([baseConfig.deepSeekApiKey, baseConfig.bridgeAuthKey, metadataSecret].map(escapeRegExp).join("|")));
    assert.match(combined, /tool-compatible-thinking-disabled/);
    await app.close();
});
