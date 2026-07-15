import { jest } from '@jest/globals';

const mockSendRequest = jest.fn();

jest.unstable_mockModule('./config.js', () => ({
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
      sendRequest: mockSendRequest,
    },
  },
}));

jest.unstable_mockModule('sillytavern-utils-lib/config', () => ({
  st_echo: jest.fn(),
}));

const { normalizeChatCompletionPayload, sendGenerateRequest } = await import('./generate.js');

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
    expect(
      normalizeChatCompletionPayload({ max_tokens: 1234, top_k: 10 }, 'custom', 'gpt-5.6-luna'),
    ).toEqual({ max_completion_tokens: 1234 });

    expect(
      normalizeChatCompletionPayload({ max_tokens: 1234, top_k: 10 }, 'custom', 'some-other-model'),
    ).toEqual({ max_tokens: 1234 });

    expect(
      normalizeChatCompletionPayload({ max_tokens: 1234, top_k: 10 }, 'anthropic', 'gpt-5.6-luna'),
    ).toEqual({ max_tokens: 1234, top_k: 10 });
  });
});
