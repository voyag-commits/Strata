function asBoolean(value, defaultValue = false) {
    if (value === undefined || value === "")
        return defaultValue;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
function asPort(value, defaultValue) {
    if (!value)
        return defaultValue;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid PORT: ${value}`);
    }
    return parsed;
}
function asPositiveInt(value, defaultValue, field) {
    if (!value)
        return defaultValue;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid ${field}: ${value}`);
    }
    return parsed;
}
function parseEffort(value) {
    const v = (value ?? "").trim().toLowerCase();
    if (v === "high")
        return "high";
    if (v === "max" || v === "xhigh")
        return "max";
    return undefined;
}
function parseModels(value, fallback) {
    const models = (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    if (!models.includes(fallback))
        models.unshift(fallback);
    return models.length > 0 ? [...new Set(models)] : [fallback];
}
export function loadConfig(env = process.env) {
    const deepSeekModel = env.DEEPSEEK_MODEL || "deepseek-v4-pro";
    return {
        deepSeekApiKey: env.DEEPSEEK_API_KEY || "",
        bridgeAuthKey: env.BRIDGE_AUTH_KEY || undefined,
        deepSeekBaseUrl: (env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
        deepSeekModel,
        advertisedModels: parseModels(env.DEEPSEEK_MODELS, deepSeekModel),
        forceModel: asBoolean(env.DEEPSEEK_FORCE_MODEL, false),
        enableThinking: asBoolean(env.DEEPSEEK_ENABLE_THINKING, true),
        thinkingBudget: env.DEEPSEEK_THINKING_BUDGET
            ? asPositiveInt(env.DEEPSEEK_THINKING_BUDGET, 0, "DEEPSEEK_THINKING_BUDGET")
            : undefined,
        reasoningEffort: parseEffort(env.DEEPSEEK_REASONING_EFFORT),
        debugTraceDir: env.BRIDGE_DEBUG_TRACE_DIR || env.STRATA_BRIDGE_DEBUG_TRACE_DIR || undefined,
        errorLog: env.BRIDGE_ERROR_LOG || undefined,
        upstreamProxyUrl: env.UPSTREAM_PROXY_URL || env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || undefined,
        upstreamTimeoutMs: asPositiveInt(env.UPSTREAM_TIMEOUT_MS, 120000, "UPSTREAM_TIMEOUT_MS"),
        port: asPort(env.PORT, 38441),
    };
}
