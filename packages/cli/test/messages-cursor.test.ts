import { describe, expect, it, mock } from 'bun:test'
import { resolveMessageCursor } from '../src/lib/resolve.js'

describe('resolveMessageCursor', () => {
  const chatID = '!chat:beeper.com'

  it('resolves a message ID to its sortKey', async () => {
    const retrieve = mock(async (id: string, params: { chatID: string }) => {
      expect(id).toBe('1343993')
      expect(params.chatID).toBe(chatID)
      return { id: '1343993', chatID, sortKey: '821744079' }
    })
    const client = { messages: { retrieve } }
    await expect(resolveMessageCursor(client, chatID, '1343993')).resolves.toBe('821744079')
    expect(retrieve).toHaveBeenCalledTimes(1)
  })

  it('passes through an already-resolved sortKey when retrieve 404s', async () => {
    const retrieve = mock(async () => {
      throw new Error('Message not found (404)')
    })
    const client = { messages: { retrieve } }
    await expect(resolveMessageCursor(client, chatID, '821744079')).resolves.toBe('821744079')
  })

  it('returns undefined when no cursor is provided', async () => {
    const retrieve = mock(async () => ({ id: 'x', sortKey: 'y' }))
    const client = { messages: { retrieve } }
    await expect(resolveMessageCursor(client, chatID, undefined)).resolves.toBeUndefined()
    expect(retrieve).toHaveBeenCalledTimes(0)
  })

  it('passes through when retrieve is unavailable', async () => {
    const client = { messages: {} }
    await expect(resolveMessageCursor(client, chatID, '1343993')).resolves.toBe('1343993')
  })

  it('passes through when retrieve succeeds but sortKey is missing', async () => {
    const retrieve = mock(async () => ({ id: '1343993', chatID }))
    const client = { messages: { retrieve } }
    await expect(resolveMessageCursor(client, chatID, '1343993')).resolves.toBe('1343993')
  })

  it('rethrows unexpected retrieve errors', async () => {
    const retrieve = mock(async () => {
      throw new Error('network down')
    })
    const client = { messages: { retrieve } }
    await expect(resolveMessageCursor(client, chatID, '1343993')).rejects.toThrow('network down')
  })
})

describe('messages list + context cursor wiring', () => {
  it('list uses resolved sortKey as API cursor', async () => {
    const listCalls: Array<{ chatID: string; query: { cursor?: string; direction?: string } }> = []
    const retrieve = mock(async (id: string) => ({ id, chatID: '!c:beeper.com', sortKey: 'sort-from-id' }))
    const list = mock((chatID: string, query: { cursor?: string; direction?: string } = {}) => {
      listCalls.push({ chatID, query })
      return (async function* () {})()
    })
    const client = {
      chats: {
        retrieve: mock(async (id: string) => ({ id })),
      },
      messages: { retrieve, list },
    }

    // Simulate the list command's resolve + list call sequence
    const { resolveChatID, resolveMessageCursor } = await import('../src/lib/resolve.js')
    const chatID = await resolveChatID(client, '!c:beeper.com')
    const cursor = await resolveMessageCursor(client, chatID, 'msg-1')
    for await (const _ of client.messages.list(chatID, { cursor, direction: 'before' })) { /* drain */ }

    expect(cursor).toBe('sort-from-id')
    expect(listCalls).toEqual([{ chatID: '!c:beeper.com', query: { cursor: 'sort-from-id', direction: 'before' } }])
  })

  it('context uses the same resolved sortKey for before and after pages', async () => {
    const listCalls: Array<{ cursor?: string; direction?: string }> = []
    const retrieve = mock(async (id: string) => ({ id, chatID: '!c:beeper.com', sortKey: 'sk-99' }))
    const list = mock((_chatID: string, query: { cursor?: string; direction?: string } = {}) => {
      listCalls.push(query)
      return (async function* () {})()
    })
    const client = { messages: { retrieve, list } }
    const { resolveMessageCursor } = await import('../src/lib/resolve.js')
    const chatID = '!c:beeper.com'
    const cursor = await resolveMessageCursor(client, chatID, 'target-id')
    for await (const _ of client.messages.list(chatID, { cursor, direction: 'before' })) { /* drain */ }
    for await (const _ of client.messages.list(chatID, { cursor, direction: 'after' })) { /* drain */ }

    expect(cursor).toBe('sk-99')
    expect(listCalls).toEqual([
      { cursor: 'sk-99', direction: 'before' },
      { cursor: 'sk-99', direction: 'after' },
    ])
    expect(retrieve).toHaveBeenCalledTimes(1)
  })
})
