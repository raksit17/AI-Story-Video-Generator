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

export interface ProjectSummary { id: string; title: string; updatedAt: string }
export interface CharacterProfile { id: string; name: string; description: string; referenceUrl: string | null; voiceId: string | null; updatedAt: string }
export interface MossVoice { id: string; name: string; language: 'Thai' | 'English'; character?: string; created_at: string }
export interface SceneVoiceStatus { status: 'idle' | 'queued' | 'running' | 'completed' | 'failed'; id?: string; url?: string; error?: string }

export class StoryApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export function createStoryApi(
  fetcher: typeof fetch = (input, init) => fetch(input, init),
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

  async function listStories(): Promise<ProjectSummary[]> {
    return (await requestJson<{ items: ProjectSummary[] }>('/stories', { method: 'GET' })).items;
  }

  async function getStory(id: string): Promise<Record<string, any>> {
    return requestJson(`/stories/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  async function listCharacterProfiles(): Promise<CharacterProfile[]> {
    return (await requestJson<{ items: CharacterProfile[] }>('/stories/character-profiles', { method: 'GET' })).items;
  }

  async function saveCharacterProfile(profile: { id?: string; name: string; description: string; referenceData?: string; referenceUrl?: string | null; voiceId?: string | null }): Promise<CharacterProfile> {
    const { id, ...body } = profile;
    return requestJson<CharacterProfile>(id ? `/stories/character-profiles/${encodeURIComponent(id)}` : '/stories/character-profiles', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(body),
    });
  }

  async function listVoices(): Promise<MossVoice[]> {
    return (await requestJson<{ items: MossVoice[] }>('/stories/voice-profiles', { method: 'GET' })).items;
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

  async function startSceneVoice(storyId: string, sceneId: string, voiceId?: string): Promise<SceneVoiceStatus> {
    return requestJson(`/stories/${encodeURIComponent(storyId)}/scenes/${encodeURIComponent(sceneId)}/voice`, {
      method: 'POST', body: JSON.stringify({ voiceId }),
    });
  }

  async function getSceneVoiceStatus(storyId: string, sceneId: string): Promise<SceneVoiceStatus> {
    return requestJson(`/stories/${encodeURIComponent(storyId)}/scenes/${encodeURIComponent(sceneId)}/voice/status`, { method: 'GET' });
  }

  return { saveStory, listStories, getStory, listCharacterProfiles, saveCharacterProfile, listVoices, startSceneImage, getSceneImageStatus, startSceneVoice, getSceneVoiceStatus };
}

export const storyApi = createStoryApi();
