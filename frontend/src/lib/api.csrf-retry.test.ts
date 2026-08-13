// @vitest-environment jsdom
/**
 * api.ts — auto-réparation CSRF (vu en prod : un jeton périmé en localStorage
 * masque le cookie frais → chaque mutation 403 « Invalid CSRF token » pour
 * toujours, session pourtant valide).
 *
 * Contrat verrouillé ici :
 *   1. 403 « Invalid CSRF token » → UN refresh (qui réaligne le jeton via
 *      storeCsrfToken) puis UN rejeu portant le jeton frais — sûr car
 *      verifyCsrf est la première garde serveur (rien n'a été exécuté).
 *   2. Anti-boucle : le rejeu qui re-403 CSRF est jeté tel quel (un seul
 *      rejeu au total — même garde _isRetryAfterRefresh que le 401).
 *   3. Refresh en échec → l'erreur 403 d'origine est jetée, pas de rejeu.
 *   4. Un 403 d'un AUTRE code (métier) n'est jamais rejoué ni ne déclenche
 *      de refresh.
 *
 * `fetch` est mocké globalement ; on route par URL (refresh vs endpoint).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError } from './api';

const CSRF_KEY = 'app-csrf';

type Handler = () => Response;

let refreshHandler: Handler;
let endpointResponses: Response[];
let endpointCalls: { url: string; init: RequestInit | undefined }[];
let refreshCalls: number;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const mockFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  if (url.includes('/api/auth/refresh')) {
    refreshCalls++;
    return Promise.resolve(refreshHandler());
  }
  endpointCalls.push({ url, init });
  const next = endpointResponses.shift();
  if (!next) throw new Error('mock fetch: no endpoint response queued');
  return Promise.resolve(next);
});

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockClear();
  endpointResponses = [];
  endpointCalls = [];
  refreshCalls = 0;
  refreshHandler = () => json(200, { csrfToken: 'fresh-token' });
  // Jeton PÉRIMÉ pré-existant (le scénario terrain : localStorage masque le
  // cookie frais — getCsrfToken préfère localStorage).
  localStorage.setItem(CSRF_KEY, 'stale-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function csrfHeaderOf(call: { init: RequestInit | undefined }): string | undefined {
  return (call.init?.headers as Record<string, string> | undefined)?.['x-csrf-token'];
}

describe('api() — auto-réparation 403 Invalid CSRF token', () => {
  it('403 CSRF → refresh (jeton réaligné) → rejeu unique avec le jeton frais → succès', async () => {
    endpointResponses = [json(403, { error: 'Invalid CSRF token' }), json(200, { ok: true })];

    const res = await api<{ ok: boolean }>('/api/products', {
      method: 'POST',
      body: { name: 'Brûleur' },
    });

    expect(res).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    expect(endpointCalls).toHaveLength(2);
    expect(csrfHeaderOf(endpointCalls[0]!)).toBe('stale-token');
    // Le rejeu porte le jeton re-frappé par le refresh (storeCsrfToken).
    expect(csrfHeaderOf(endpointCalls[1]!)).toBe('fresh-token');
  });

  it('anti-boucle : le rejeu qui re-403 CSRF est jeté tel quel (un seul refresh)', async () => {
    endpointResponses = [
      json(403, { error: 'Invalid CSRF token' }),
      json(403, { error: 'Invalid CSRF token' }),
    ];

    await expect(api('/api/products', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 403,
      code: 'Invalid CSRF token',
    });
    expect(refreshCalls).toBe(1);
    expect(endpointCalls).toHaveLength(2);
  });

  it('refresh en échec → erreur 403 d’origine jetée, pas de rejeu', async () => {
    refreshHandler = () => json(401, { error: 'REFRESH_INVALID' });
    endpointResponses = [json(403, { error: 'Invalid CSRF token' })];

    await expect(api('/api/products', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 403,
      code: 'Invalid CSRF token',
    });
    expect(refreshCalls).toBe(1);
    expect(endpointCalls).toHaveLength(1);
  });

  it('un 403 métier (autre code) n’est ni rejoué ni rafraîchi', async () => {
    endpointResponses = [json(403, { error: 'SUBSCRIPTION_EXPIRED' })];

    await expect(api('/api/products', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 403,
      code: 'SUBSCRIPTION_EXPIRED',
    });
    expect(refreshCalls).toBe(0);
    expect(endpointCalls).toHaveLength(1);
  });

  it('sanity : une erreur jetée reste une ApiError', async () => {
    endpointResponses = [json(403, { error: 'SUBSCRIPTION_EXPIRED' })];
    await expect(api('/api/products', { method: 'POST', body: {} })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
