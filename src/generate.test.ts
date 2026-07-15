import { jest } from '@jest/globals';

const mockSendRequest = jest.fn();

jest.unstable_mockModule('./config.js', () => ({
  context: {
    extensionSettings: {
      connectionManager: {
        profiles: [{ id: 'profile-1', api: 'openai', preset: 'preset-1' }],
      },
    },
    ConnectionManagerRequestService: {
      sendRequest: mockSendRequest,
    },
  },
}));

jest.unstable_mockModule('sillytavern-utils-lib/config', () => ({
  st_echo: jest.fn(),
}));

const { sendGenerateRequest } = await import('./generate.js');

describe('sendGenerateRequest', () => {
  beforeEach(() => {
    mockSendRequest.mockReset();
    mockSendRequest.mockResolvedValue({ content: 'translated' });
  });

  it('does not apply sampler settings from the connection profile preset', async () => {
    await sendGenerateRequest('profile-1', 'Translate this');

    expect(mockSendRequest).toHaveBeenCalledWith(
      'profile-1',
      [{ content: 'Translate this', role: 'user' }],
      4096,
      { includePreset: false },
    );
  });
});
