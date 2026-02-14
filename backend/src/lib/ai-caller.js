import { logError, logInfo } from '../logger.js';

/**
 * Universal AI caller supporting OpenAI and Gemini with tool calling
 */

/**
 * Call AI with messages and optional tools
 * @param {Object} config - { provider, model, apiKey }
 * @param {Array} messages - [{ role, content }]
 * @param {Object} options - { temperature, maxTokens, tools, toolChoice, responseFormat }
 * @returns {Object} - { content, toolCalls, tokensUsed, model }
 */
export async function callAI(config, messages, options = {}) {
  const {
    temperature = 0.7,
    maxTokens = 1000,
    tools = null,
    toolChoice = 'auto',
    responseFormat = null,
  } = options;

  if (config.provider === 'openai') {
    return callOpenAI(config, messages, { temperature, maxTokens, tools, toolChoice, responseFormat });
  } else if (config.provider === 'gemini') {
    return callGemini(config, messages, { temperature, maxTokens, tools, responseFormat });
  }

  throw new Error(`Provedor de IA não suportado: ${config.provider}`);
}

/**
 * Process a complete agent turn, handling tool calls recursively
 * @param {Object} config - AI config
 * @param {Array} messages - conversation messages
 * @param {Object} options - AI options
 * @param {Function} toolExecutor - async (toolName, args) => result string
 * @param {number} maxIterations - prevent infinite loops
 * @returns {Object} - { content, tokensUsed, model, toolCallsExecuted }
 */
export async function callAIWithTools(config, messages, options, toolExecutor, maxIterations = 3) {
  let totalTokens = 0;
  let toolCallsExecuted = [];
  let currentMessages = [...messages];

  for (let i = 0; i < maxIterations; i++) {
    const result = await callAI(config, currentMessages, options);
    totalTokens += result.tokensUsed || 0;

    // If no tool calls, return the final content
    if (!result.toolCalls || result.toolCalls.length === 0) {
      return {
        content: result.content,
        tokensUsed: totalTokens,
        model: result.model,
        toolCallsExecuted,
      };
    }

    // Execute tool calls
    for (const toolCall of result.toolCalls) {
      const toolResult = await toolExecutor(toolCall.name, toolCall.arguments);
      toolCallsExecuted.push({
        name: toolCall.name,
        arguments: toolCall.arguments,
        result: toolResult,
      });

      // Add tool call and result to messages for next iteration
      if (config.provider === 'openai') {
        currentMessages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: toolCall.id,
            type: 'function',
            function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) }
          }]
        });
        currentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
        });
      } else {
        // For Gemini, append as user context
        currentMessages.push({
          role: 'user',
          content: `[Resultado da ferramenta "${toolCall.name}"]: ${typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)}`,
        });
      }
    }
  }

  // Max iterations reached, return last content
  const finalResult = await callAI(config, currentMessages, { ...options, tools: null });
  totalTokens += finalResult.tokensUsed || 0;

  return {
    content: finalResult.content,
    tokensUsed: totalTokens,
    model: finalResult.model,
    toolCallsExecuted,
  };
}

// ==================== OpenAI ====================

async function callOpenAI(config, messages, options) {
  const body = {
    model: config.model || 'gpt-4o-mini',
    messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  };

  if (options.tools) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice;
  }

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  const toolCalls = choice?.message?.tool_calls?.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || '{}'),
  })) || [];

  return {
    content: choice?.message?.content || '',
    toolCalls,
    tokensUsed: data.usage?.total_tokens || 0,
    model: data.model,
  };
}

// ==================== Gemini ====================

async function callGemini(config, messages, options) {
  const model = config.model || 'gemini-1.5-flash';
  
  // Convert messages to Gemini format
  const contents = [];
  let systemInstruction = null;

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = msg.content;
      continue;
    }
    if (msg.role === 'tool') continue; // handled in callAIWithTools by appending as user

    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  const body = {
    contents,
    generationConfig: {
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (options.responseFormat?.type === 'json_object') {
    body.generationConfig.responseMimeType = 'application/json';
  }

  // Gemini tool calling
  if (options.tools) {
    body.tools = [{
      functionDeclarations: options.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    }];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  // Check for function calls
  const toolCalls = parts
    .filter(p => p.functionCall)
    .map((p, idx) => ({
      id: `gemini-tc-${Date.now()}-${idx}`,
      name: p.functionCall.name,
      arguments: p.functionCall.args || {},
    }));

  const textContent = parts
    .filter(p => p.text)
    .map(p => p.text)
    .join('');

  return {
    content: textContent,
    toolCalls,
    tokensUsed: data.usageMetadata?.totalTokenCount || 0,
    model,
  };
}
