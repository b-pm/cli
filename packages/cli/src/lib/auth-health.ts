export type AccessTokenCheck = {
  state: 'valid' | 'invalid' | 'unknown' | 'missing'
  status?: number
  error?: string
}

export async function checkAccessToken(
  baseURL: string,
  token: string | undefined,
  options: {
    timeoutMs?: number
    fetcher?: typeof fetch
  } = {},
): Promise<AccessTokenCheck> {
  if (!token) return { state: 'missing' }

  const fetcher = options.fetcher ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 2_000)

  try {
    const response = await fetcher(new URL('/v1/app/setup', baseURL), {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    })

    if (response.status === 401 || response.status === 403) {
      return { state: 'invalid', status: response.status }
    }
    if (response.ok) return { state: 'valid', status: response.status }

    return { state: 'unknown', status: response.status }
  } catch (error) {
    return {
      state: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}
