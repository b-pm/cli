import { describe, expect, it } from 'bun:test'
import { checkAccessToken } from '../src/lib/auth-health.js'

describe('checkAccessToken', () => {
  it('reports missing without making a request', async () => {
    let calls = 0
    const result = await checkAccessToken('http://127.0.0.1:23373', undefined, {
      fetcher: async () => {
        calls += 1
        return new Response(null, { status: 200 })
      },
    })

    expect(result).toEqual({ state: 'missing' })
    expect(calls).toBe(0)
  })

  it('reports valid when the target accepts the bearer', async () => {
    let authHeader: string | null = null
    const result = await checkAccessToken('http://127.0.0.1:23373', 'secret-token', {
      fetcher: async (_input, init) => {
        authHeader = new Headers(init?.headers).get('authorization')
        return new Response('{}', { status: 200 })
      },
    })

    expect(result).toEqual({ state: 'valid', status: 200 })
    expect(authHeader).toBe('Bearer secret-token')
  })

  it('reports invalid on authentication rejection without exposing the token', async () => {
    const result = await checkAccessToken('http://127.0.0.1:23373', 'secret-token', {
      fetcher: async () => new Response('Invalid token', { status: 401 }),
    })

    expect(result).toEqual({ state: 'invalid', status: 401 })
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })

  it('reports unknown for non-auth failures', async () => {
    const statusResult = await checkAccessToken('http://127.0.0.1:23373', 'token', {
      fetcher: async () => new Response('server error', { status: 500 }),
    })
    expect(statusResult).toEqual({ state: 'unknown', status: 500 })

    const networkResult = await checkAccessToken('http://127.0.0.1:23373', 'token', {
      fetcher: async () => {
        throw new Error('connection refused')
      },
    })
    expect(networkResult).toEqual({ state: 'unknown', error: 'connection refused' })
  })
})
