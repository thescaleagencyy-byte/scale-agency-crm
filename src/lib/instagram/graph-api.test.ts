import { describe, expect, it, vi, afterEach } from 'vitest'
import { sendInstagramTextMessage } from './graph-api'

describe('sendInstagramTextMessage', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('posts to the Graph API messages endpoint and returns the message id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message_id: 'mid.123' }),
    })
    global.fetch = fetchMock as never

    const result = await sendInstagramTextMessage({
      igUserId: '17841400000000000',
      accessToken: 'test-token',
      to: '179847374527',
      text: 'Hello',
    })

    expect(result).toEqual({ messageId: 'mid.123' })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('17841400000000000/messages'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws with the Graph API error message on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Invalid recipient' } }),
    }) as never

    await expect(
      sendInstagramTextMessage({
        igUserId: '17841400000000000',
        accessToken: 'test-token',
        to: 'bad-id',
        text: 'Hello',
      }),
    ).rejects.toThrow('Invalid recipient')
  })
})
