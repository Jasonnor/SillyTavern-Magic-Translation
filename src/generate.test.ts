jest.mock('sillytavern-utils-lib/config', () => ({
  st_echo: jest.fn(),
}));

jest.mock('./config.js', () => ({
  context: {
    CONNECT_API_MAP: {
      openai: { selected: 'openai', source: 'custom' },
    },
    extensionSettings: {
      connectionManager: {
        profiles: [{ id: 'profile-1', api: 'openai', model: 'gpt-5.6-luna', preset: 'preset-1' }],
      },
    },
    ChatCompletionService: {
      createRequestData: (requestData: Record<string, any>) => ({ ...requestData }),
    },
    ConnectionManagerRequestService: {
      sendRequest: jest.fn(),
    },
  },
}));

import { context } from './config.js';
import { normalizeChatCompletionPayload, sendGenerateRequest } from './generate.js';

const mockSendRequest = (context as any).ConnectionManagerRequestService.sendRequest as jest.Mock;

describe('sendGenerateRequest', () => {
  beforeEach(() => {
    mockSendRequest.mockReset();
    mockSendRequest.mockResolvedValue({ content: 'translated' });
  });

  it('lets the connection profile preset provide the token limit', async () => {
    await sendGenerateRequest('profile-1', 'Translate this');

    expect(mockSendRequest).toHaveBeenCalledWith(
      'profile-1',
      [{ content: 'Translate this', role: 'user' }],
      undefined,
      { includePreset: true },
    );
  });

  it('converts the preset token field only for OpenAI-compatible reasoning models', () => {
    expect(normalizeChatCompletionPayload({ max_tokens: 1234, top_k: 10 }, 'custom', 'gpt-5.6-luna')).toEqual({
      max_completion_tokens: 1234,
    });

    expect(normalizeChatCompletionPayload({ max_tokens: 1234, top_k: 10 }, 'custom', 'some-other-model')).toEqual({
      max_tokens: 1234,
    });

    expect(normalizeChatCompletionPayload({ max_tokens: 1234, top_k: 10 }, 'anthropic', 'gpt-5.6-luna')).toEqual({
      max_tokens: 1234,
      top_k: 10,
    });
  });

  it('drops the sampling parameters reasoning models reject', () => {
    expect(
      normalizeChatCompletionPayload(
        {
          max_tokens: 1234,
          temperature: 1,
          top_p: 0.8,
          presence_penalty: 0.1,
          frequency_penalty: 0.1,
          logprobs: true,
          top_logprobs: 5,
          logit_bias: {},
          stream: false,
        },
        'custom',
        'gpt-5.6-luna',
      ),
    ).toEqual({ max_completion_tokens: 1234, stream: false });

    expect(
      normalizeChatCompletionPayload({ temperature: 0.7, top_p: 0.8 }, 'custom', 'o3-mini'),
    ).toEqual({});

    // Non-reasoning models keep their samplers.
    expect(
      normalizeChatCompletionPayload({ temperature: 0.7, top_p: 0.8 }, 'custom', 'some-other-model'),
    ).toEqual({ temperature: 0.7, top_p: 0.8 });

    // Non-OpenAI sources are left alone entirely.
    expect(normalizeChatCompletionPayload({ top_p: 0.8, top_k: 10 }, 'anthropic', 'gpt-5.6-luna')).toEqual({
      top_p: 0.8,
      top_k: 10,
    });
  });
});
