#!/usr/bin/env node
import { ProxyAgent } from "undici";
import { loadConfig } from "./config.js";
import { createApp } from "./server.js";
import { safeLog } from "./log.js";
const config = loadConfig();
const proxyDispatcher = config.upstreamProxyUrl ? new ProxyAgent(config.upstreamProxyUrl) : undefined;
const fetchFn = proxyDispatcher
    ? ((input, init) => fetch(input, { ...init, dispatcher: proxyDispatcher }))
    : undefined;
const app = createApp({ config, fetchFn, enableRequestLogs: true });
try {
    await app.listen({ host: "127.0.0.1", port: config.port });
    safeLog("server.start", {
        address: `http://127.0.0.1:${config.port}`,
        responses_url: `http://127.0.0.1:${config.port}/v1/responses`,
        model: config.deepSeekModel,
        auth_enabled: Boolean(config.bridgeAuthKey),
        upstream_proxy_enabled: Boolean(config.upstreamProxyUrl),
    });
}
catch (error) {
    safeLog("server.failed", { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
}
