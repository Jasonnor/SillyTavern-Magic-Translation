import { ExtractedData } from 'sillytavern-utils-lib/types';
import { context } from './config.js';
import { st_echo } from 'sillytavern-utils-lib/config';

type RequestPayload = Record<string, any>;

// These sources use the OpenAI-compatible request shape. SillyTavern already
// applies the max_completion_tokens conversion for its built-in sources, but
// custom OpenAI-compatible sources need the same treatment here.
const OPENAI_COMPATIBLE_SOURCES = new Set(['openai', 'azure_openai', 'openrouter', 'custom']);
const COMPLETION_TOKEN_MODELS = /^(?:o1|o3|o4)|gpt-5/i;

// SillyTavern's preset can contain top_k for samplers that support it. It is
// not valid in the OpenAI-compatible payload used by this extension.
export function normalizeChatCompletionPayload(
  payload: RequestPayload,
  source?: string,
  model?: string,
): RequestPayload {
  const normalizedPayload = { ...payload };
  const isOpenAICompatible = !source || OPENAI_COMPATIBLE_SOURCES.has(source);

  if (isOpenAICompatible) {
    delete normalizedPayload.top_k;
  }

  if (
    isOpenAICompatible &&
    model &&
    COMPLETION_TOKEN_MODELS.test(model) &&
    normalizedPayload.max_tokens !== undefined
  ) {
    normalizedPayload.max_completion_tokens ??= normalizedPayload.max_tokens;
    delete normalizedPayload.max_tokens;
  }

  return normalizedPayload;
}

function getProfileApiMap(profile: { api?: string }): { selected?: string; source?: string } | undefined {
  return (context as any).CONNECT_API_MAP?.[profile.api ?? ''];
}

let chatCompletionRequestQueue = Promise.resolve();

async function sendWithChatCompletionCompatibility<T>(
  profile: { api?: string; model?: string },
  sendRequest: () => Promise<T>,
): Promise<T> {
  const apiMap = getProfileApiMap(profile);
  const isChatCompletion = apiMap?.selected === 'openai' || (!apiMap && profile.api === 'openai');
  const chatCompletionService = (context as any).ChatCompletionService;

  if (!isChatCompletion || typeof chatCompletionService?.createRequestData !== 'function') {
    return sendRequest();
  }

  // createRequestData is called once before and once after SillyTavern merges
  // the preset. Queue these small compatibility patches so concurrent
  // translations cannot restore each other's method.
  const previousRequest = chatCompletionRequestQueue;
  let releaseRequest!: () => void;
  chatCompletionRequestQueue = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await previousRequest;

  const originalCreateRequestData = chatCompletionService.createRequestData;
  chatCompletionService.createRequestData = function (requestData: RequestPayload): RequestPayload {
    const payload = originalCreateRequestData.call(this, requestData);
    return normalizeChatCompletionPayload(payload, apiMap?.source, profile.model);
  };

  try {
    return await sendRequest();
  } finally {
    chatCompletionService.createRequestData = originalCreateRequestData;
    releaseRequest();
  }
}

export async function sendGenerateRequest(profileId: string, prompt: string): Promise<string | null> {
  const profile = context.extensionSettings.connectionManager!.profiles.find((p) => p.id === profileId);
  if (!profile) {
    st_echo('error', `Could not find profile with id ${profileId}`);
    return null;
  }
  if (!profile.api) {
    st_echo('error', 'Select a connection profile that has an API');
    return null;
  }
  if (!profile.preset) {
    st_echo('error', 'Select a connection profile that has a preset');
    return null;
  }

  const response = (await sendWithChatCompletionCompatibility(profile, () =>
    context.ConnectionManagerRequestService.sendRequest(
      profile.id,
      [
        {
          content: prompt,
          role: 'user',
        },
      ],
      // Let the selected SillyTavern preset provide the token limit.
      undefined as unknown as number,
      { includePreset: true },
    ),
  )) as ExtractedData;
  return response.content;
}
