// Browser requests use Vite's local /api proxy; do not expose API keys in VITE_*.
export interface StoryPayload {
  title: string;
  prompt: string;
  genre: string;
  language: string;
  aspect: string;
  characters: Array<{ name: string; description: string; appearance: string }>;
  scenes: Array<{
    id: string;
    title: string;
    narration: string;
    imagePrompt: string;
    duration: number;
    motion: string;
    imageUrl?: string;
  }>;
}

export interface SceneImageStatus {
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  promptId?: string;
  url?: string;
  error?: string;
}

export class StoryApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export function createStoryApi(
  fetcher: typeof fetch = fetch,
  baseUrl: string = import.meta.env.VITE_API_BASE_URL || '/api/v1',
) {
  const base = baseUrl.replace(/\/$/, '');

  async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetcher(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
      const detail = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
      throw new StoryApiError(detail || `API error ${response.status}`, response.status);
    }
    return response.json() as Promise<T>;
  }

  async function createStory(payload: StoryPayload): Promise<string> {
    const saved = await requestJson<{ id: string }>('/stories', {
      method: 'POST', body: JSON.stringify(payload),
    });
    return saved.id;
  }

  async function saveStory(payload: StoryPayload, existingId?: string): Promise<string> {
    if (!existingId) return createStory(payload);
    try {
      const saved = await requestJson<{ id: string }>(
        `/stories/${encodeURIComponent(existingId)}`,
        { method: 'PUT', body: JSON.stringify(payload) },
      );
      return saved.id;
    } catch (error) {
      // The browser project may outlive a reset of api/storage/stories.
      if (error instanceof StoryApiError && error.status === 404) {
        return createStory(payload);
      }
      throw error;
    }
  }

  async function startSceneImage(storyId: string, sceneId: string): Promise<SceneImageStatus> {
    return requestJson<SceneImageStatus>(
      `/stories/${encodeURIComponent(storyId)}/scenes/${encodeURIComponent(sceneId)}/image`,
      { method: 'POST' },
    );
  }

  async function getSceneImageStatus(storyId: string, sceneId: string): Promise<SceneImageStatus> {
    return requestJson<SceneImageStatus>(
      `/stories/${encodeURIComponent(storyId)}/scenes/${encodeURIComponent(sceneId)}/image/status`,
      { method: 'GET' },
    );
  }

  return { saveStory, startSceneImage, getSceneImageStatus };
}

export const storyApi = createStoryApi();
