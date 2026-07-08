export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
  reasoning_content?: string;
}

export interface ChatToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
    strict?: boolean;
  };
}

export interface ResponsesRequest {
  model?: string;
  instructions?: unknown;
  developer?: unknown;
  input?: unknown;
  max_output_tokens?: number;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  reasoning?: {
    effort?: string;
    summary?: string;
  } | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DeepSeekChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  tools?: ChatTool[];
  tool_choice?: unknown;
  thinking?: {
    type: "enabled" | "disabled";
    reasoning_effort?: "high" | "max";
    budget_tokens?: number;
  };
}

export interface BridgeConfig {
  deepSeekApiKey: string;
  bridgeAuthKey?: string;
  deepSeekBaseUrl: string;
  deepSeekModel: string;
  advertisedModels: string[];
  forceModel: boolean;
  enableThinking: boolean;
  thinkingBudget?: number;
  reasoningEffort?: "high" | "max";
  debugTraceDir?: string;
  errorLog?: string;
  upstreamProxyUrl?: string;
  upstreamTimeoutMs: number;
  port: number;
}

export interface DeepSeekChatResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    finish_reason?: string | null;
    message?: {
      role?: string;
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: ChatToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ResponseObject {
  id: string;
  object: "response";
  created_at: number;
  model: string;
  status: "completed" | "failed" | "in_progress";
  output: unknown[];
  usage?: unknown;
  metadata?: Record<string, unknown>;
}

export interface OpenAIErrorBody {
  error: {
    message: string;
    type: string;
    code?: string | number | null;
    param?: string | null;
  };
}
