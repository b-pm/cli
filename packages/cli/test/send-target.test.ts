import { describe, expect, it } from 'bun:test'
import { resolveSendChatID } from '../src/lib/send-message.js'

function pages<T>(items: T[]) {
  return async function* () {
    for (const item of items) yield item
  }()
}

describe('resolveSendChatID', () => {
  it('reuses existing chat selector behavior when no account is supplied', async () => {
    const client = {
      chats: {
        retrieve: async (id: string) => ({ id }),
        search: () => pages([]),
      },
    }

    await expect(resolveSendChatID(client, { to: '!chat:beeper.com' })).resolves.toBe('!chat:beeper.com')
  })

  it('starts or reuses an iMessage DM from a phone number when --account is supplied', async () => {
    let startPayload: unknown
    const chat = {
      id: 'imsg##thread:new',
      accountID: 'imessage_deadbeef',
      network: 'iMessage',
      type: 'single',
      title: '+1 555 123 4567',
    }
    const client = {
      accounts: {
        list: async () => ({ items: [] }),
      },
      chats: {
        search: () => pages([chat]),
        list: () => pages([]),
        start: async (payload: unknown) => {
          startPayload = payload
          return chat
        },
      },
    }

    const chatID = await resolveSendChatID(client, {
      to: '+15551234567',
      account: 'iMessage',
    })

    expect(chatID).toBe('imsg##thread:new')
    expect(startPayload).toEqual({
      accountID: 'imessage_deadbeef',
      user: {
        phoneNumber: '+15551234567',
      },
    })
  })
})
