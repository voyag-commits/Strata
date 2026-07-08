function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function textFromUnknown(value) {
    if (value === undefined || value === null)
        return "";
    if (typeof value === "string")
        return value;
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    if (Array.isArray(value))
        return value.map((item) => textFromUnknown(item)).filter(Boolean).join("\n");
    if (isRecord(value)) {
        if (typeof value.text === "string")
            return value.text;
        if (typeof value.output === "string")
            return value.output;
        if (typeof value.content === "string")
            return value.content;
        if (Array.isArray(value.content))
            return textFromUnknown(value.content);
        if (value.type === "input_text" || value.type === "output_text" || value.type === "text") {
            return typeof value.text === "string" ? value.text : "";
        }
        if (value.type === "input_image")
            return "[image input omitted by DeepSeek text bridge]";
        return JSON.stringify(value);
    }
    return String(value);
}
function normalizeRole(role) {
    if (role === "system" || role === "developer")
        return "system";
    if (role === "user" || role === "assistant" || role === "tool")
        return role;
    return null;
}
function sanitizeToolName(name) {
    const cleaned = name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
    return cleaned || "tool";
}
function makeId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
function contentToText(content) {
    if (typeof content === "string")
        return content;
    if (Array.isArray(content)) {
        return content
            .map((part) => {
            if (typeof part === "string")
                return part;
            if (isRecord(part)) {
                if (part.type === "input_text" || part.type === "output_text" || part.type === "text") {
                    return typeof part.text === "string" ? part.text : "";
                }
                if (part.type === "input_image")
                    return "[image input omitted by DeepSeek text bridge]";
                return textFromUnknown(part);
            }
            return textFromUnknown(part);
        })
            .filter(Boolean)
            .join("\n");
    }
    return textFromUnknown(content);
}
function appendMessage(messages, role, content, extra = {}) {
    if (role !== "assistant" && role !== "tool" && (!content || content.length === 0))
        return;
    messages.push({ role, content, ...extra });
}
function reasoningText(item) {
    const summary = item.summary;
    if (Array.isArray(summary))
        return summary.map((part) => textFromUnknown(part)).filter(Boolean).join("\n");
    if (typeof summary === "string")
        return summary;
    const content = item.content;
    if (Array.isArray(content))
        return content.map((part) => textFromUnknown(part)).filter(Boolean).join("\n");
    if (typeof content === "string")
        return content;
    return "";
}
function attachReasoning(messages, text) {
    if (!text)
        return;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role === "assistant") {
            message.reasoning_content = [message.reasoning_content, text].filter(Boolean).join("\n");
            return;
        }
    }
}
function inputItemToMessages(item, messages) {
    if (typeof item === "string") {
        appendMessage(messages, "user", item);
        return;
    }
    if (!isRecord(item)) {
        appendMessage(messages, "user", textFromUnknown(item));
        return;
    }
    const type = typeof item.type === "string" ? item.type : undefined;
    if (type === "reasoning") {
        attachReasoning(messages, reasoningText(item));
        return;
    }
    if (type === "message" || item.role) {
        const role = normalizeRole(item.role) ?? "user";
        if (role === "tool") {
            appendMessage(messages, "tool", contentToText(item.content), {
                tool_call_id: String(item.tool_call_id ?? item.call_id ?? item.id ?? "tool_call"),
            });
            return;
        }
        appendMessage(messages, role, contentToText(item.content));
        return;
    }
    if (type === "function_call") {
        const name = sanitizeToolName(String(item.name ?? "tool"));
        const callId = String(item.call_id ?? item.id ?? makeId("call"));
        const args = typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {});
        const toolCall = {
            id: callId,
            type: "function",
            function: { name, arguments: args },
        };
        appendMessage(messages, "assistant", null, { tool_calls: [toolCall] });
        return;
    }
    if (type === "function_call_output") {
        appendMessage(messages, "tool", contentToText(item.output ?? item.content), {
            tool_call_id: String(item.call_id ?? item.id ?? item.tool_call_id ?? "tool_call"),
        });
        return;
    }
    if (type === "input_text" || type === "output_text" || type === "text") {
        appendMessage(messages, "user", contentToText(item));
        return;
    }
    appendMessage(messages, "user", textFromUnknown(item));
}
export function responsesInputToMessages(request) {
    const messages = [];
    const instructions = contentToText(request.instructions);
    if (instructions)
        appendMessage(messages, "system", instructions);
    const developer = contentToText(request.developer);
    if (developer)
        appendMessage(messages, "system", developer);
    const input = request.input;
    if (typeof input === "string") {
        appendMessage(messages, "user", input);
    }
    else if (Array.isArray(input)) {
        for (const item of input)
            inputItemToMessages(item, messages);
    }
    else if (input !== undefined && input !== null) {
        inputItemToMessages(input, messages);
    }
    if (messages.length === 0)
        appendMessage(messages, "user", "");
    return coalesceAssistantToolCalls(messages);
}
function isToolCallOnlyAssistant(message) {
    return message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && !message.content;
}
function coalesceAssistantToolCalls(messages) {
    const output = [];
    for (const message of messages) {
        const previous = output[output.length - 1];
        if (previous && isToolCallOnlyAssistant(previous) && isToolCallOnlyAssistant(message)) {
            previous.tool_calls = [...(previous.tool_calls ?? []), ...(message.tool_calls ?? [])];
            previous.reasoning_content = [previous.reasoning_content, message.reasoning_content].filter(Boolean).join("\n") || undefined;
            continue;
        }
        output.push(message);
    }
    return output;
}
function toolFromResponsesTool(tool) {
    if (!isRecord(tool))
        return null;
    const type = typeof tool.type === "string" ? tool.type : "function";
    if (type === "function") {
        const maybeFunction = isRecord(tool.function) ? tool.function : tool;
        const name = sanitizeToolName(String(maybeFunction.name ?? tool.name ?? "tool"));
        return {
            type: "function",
            function: {
                name,
                description: typeof maybeFunction.description === "string" ? maybeFunction.description : undefined,
                parameters: maybeFunction.parameters ?? { type: "object", properties: {} },
                strict: typeof maybeFunction.strict === "boolean" ? maybeFunction.strict : undefined,
            },
        };
    }
    if (type === "custom" || type === "freeform" || type === "local_shell") {
        const name = sanitizeToolName(String(tool.name ?? type));
        return {
            type: "function",
            function: {
                name,
                description: typeof tool.description === "string" ? tool.description : `Adapted Codex ${type} tool`,
                parameters: {
                    type: "object",
                    properties: {
                        input: { type: "string", description: "Raw tool input from the model." },
                    },
                    required: ["input"],
                },
            },
        };
    }
    if (type === "namespace" && Array.isArray(tool.tools)) {
        return null;
    }
    return null;
}
export function responsesToolsToChatTools(tools) {
    if (!Array.isArray(tools) || tools.length === 0)
        return undefined;
    const output = [];
    for (const tool of tools) {
        if (isRecord(tool) && tool.type === "namespace" && Array.isArray(tool.tools)) {
            const namespace = sanitizeToolName(String(tool.name ?? "namespace"));
            for (const nested of tool.tools) {
                if (!isRecord(nested))
                    continue;
                const converted = toolFromResponsesTool({ ...nested, type: nested.type ?? "function" });
                if (!converted)
                    continue;
                converted.function.name = sanitizeToolName(`${namespace}_${converted.function.name}`);
                converted.function.description = `${String(tool.description ?? "Codex namespace tool")}: ${converted.function.description ?? ""}`.trim();
                output.push(converted);
            }
            continue;
        }
        const converted = toolFromResponsesTool(tool);
        if (converted)
            output.push(converted);
    }
    return output.length > 0 ? output.slice(0, 128) : undefined;
}
function mapReasoning(request, config) {
    // Thinking is ON by default (DEEPSEEK_ENABLE_THINKING defaults to true). Set it
    // to false to force the fast non-thinking path. When on, the per-request Codex
    // reasoning effort selects the DeepSeek effort tier (high -> high, xhigh/max ->
    // max); anything lower / unset leaves it to DeepSeek's default. An optional
    // numeric token budget (DEEPSEEK_THINKING_BUDGET) caps the reasoning trace.
    if (!config.enableThinking)
        return { type: "disabled" };
    // Forced bridge-level effort (DEEPSEEK_REASONING_EFFORT) wins; otherwise fall
    // back to the per-request Codex effort (note: Codex omits this for non-catalog
    // models, so the forced config is the practical control).
    let reasoning_effort = config.reasoningEffort;
    if (!reasoning_effort) {
        const requested = request.reasoning?.effort;
        if (requested === "high")
            reasoning_effort = "high";
        else if (requested === "xhigh" || requested === "max")
            reasoning_effort = "max";
    }
    const thinking = { type: "enabled" };
    if (reasoning_effort)
        thinking.reasoning_effort = reasoning_effort;
    if (config.thinkingBudget && config.thinkingBudget > 0)
        thinking.budget_tokens = config.thinkingBudget;
    return thinking;
}
export function buildDeepSeekRequest(request, config) {
    const model = config.forceModel ? config.deepSeekModel : request.model || config.deepSeekModel;
    const chatRequest = {
        model,
        messages: responsesInputToMessages(request),
        stream: Boolean(request.stream),
    };
    const maxTokens = request.max_output_tokens ?? request.max_tokens;
    if (typeof maxTokens === "number")
        chatRequest.max_tokens = maxTokens;
    if (typeof request.temperature === "number")
        chatRequest.temperature = request.temperature;
    if (typeof request.top_p === "number")
        chatRequest.top_p = request.top_p;
    if (typeof request.stop === "string" || Array.isArray(request.stop))
        chatRequest.stop = request.stop;
    const tools = responsesToolsToChatTools(request.tools);
    if (tools)
        chatRequest.tools = tools;
    if (request.tool_choice !== undefined)
        chatRequest.tool_choice = request.tool_choice;
    const thinking = mapReasoning(request, config);
    if (thinking)
        chatRequest.thinking = thinking;
    return chatRequest;
}
function usageFromDeepSeek(usage) {
    if (!usage)
        return undefined;
    return {
        input_tokens: usage.prompt_tokens ?? 0,
        output_tokens: usage.completion_tokens ?? 0,
        total_tokens: usage.total_tokens ?? 0,
        output_tokens_details: usage.completion_tokens_details
            ? { reasoning_tokens: usage.completion_tokens_details.reasoning_tokens ?? 0 }
            : undefined,
    };
}
export function deepSeekChatToResponses(chat, request) {
    const createdAt = chat.created ?? Math.floor(Date.now() / 1000);
    const responseId = chat.id?.startsWith("resp_") ? chat.id : `resp_${chat.id ?? createdAt}`;
    const choice = chat.choices?.[0];
    const message = choice?.message ?? {};
    const output = [];
    const content = typeof message.content === "string" ? message.content : "";
    if (content) {
        output.push({
            type: "message",
            id: makeId("msg"),
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: content }],
        });
    }
    if (Array.isArray(message.tool_calls)) {
        for (const call of message.tool_calls) {
            output.push({
                type: "function_call",
                id: makeId("fc"),
                call_id: call.id,
                name: call.function.name,
                arguments: call.function.arguments ?? "{}",
                status: "completed",
            });
        }
    }
    const metadata = { ...(request.metadata ?? {}) };
    if (message.reasoning_content)
        metadata.deepseek_reasoning_discarded = true;
    if (choice?.finish_reason)
        metadata.deepseek_finish_reason = choice.finish_reason;
    return {
        id: responseId,
        object: "response",
        created_at: createdAt,
        model: chat.model ?? request.model ?? "deepseek-v4-pro",
        status: "completed",
        output,
        usage: usageFromDeepSeek(chat.usage),
        metadata,
    };
}
export function deepSeekErrorToOpenAI(status, body) {
    let message = `DeepSeek upstream error (${status})`;
    let code = status;
    if (isRecord(body)) {
        if (isRecord(body.error)) {
            message = textFromUnknown(body.error.message) || message;
            code = body.error.code ?? code;
        }
        else if (typeof body.message === "string") {
            message = body.message;
            code = body.code ?? code;
        }
    }
    else if (typeof body === "string" && body.trim()) {
        message = body.slice(0, 1000);
    }
    return {
        error: {
            message,
            type: status >= 500 ? "upstream_server_error" : "upstream_request_error",
            code,
            param: null,
        },
    };
}
export const testOnly = {
    textFromUnknown,
    contentToText,
    sanitizeToolName,
};
