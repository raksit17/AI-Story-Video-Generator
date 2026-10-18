import { describe, expect, it, vi } from 'vitest';
import { createStoryApi } from '../src/services/story-api';
import type { StoryPayload } from '../src/services/story-api';

const project: StoryPayload = {
  title: 'A magical journey',
  prompt: 'An original fantasy story',
  genre: 'Anime Fantasy',
  language: 'ไทย',
  aspect: '9:16',
  characters: [{ name: 'Luna', description: 'Silver hair', appearance: 'Silver hair' }],
  scenes: [{
    id: 'scene-one',
    title: 'Opening',
    narration: 'Once upon a time',
    imagePrompt: 'A beautiful forest at sunset',
    duration: 7,
    motion: 'ซูมเข้า',
  }],
};
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const failed = (code: number, message: string) =>
  ({ ok: false, status: code, json: async () => ({ message }) }) as Response;

describe('Storyframe image API flow', () => {
  it('saves the story before queueing a scene image, then polls for the URL', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok({ id: 'story-one' }))
      .mockResolvedValueOnce(ok({ status: 'queued', promptId: 'prompt-one' }))
      .mockResolvedValueOnce(ok({
        status: 'completed',
        url: '/api/v1/stories/assets/00000000-0000-0000-0000-000000000001.png',
      }));
    const api = createStoryApi(fetcher as unknown as typeof fetch);
    const id = await api.saveStory(project);
    const started = await api.startSceneImage(id, 'scene-one');
    const completed = await api.getSceneImageStatus(id, 'scene-one');
    expect(id).toBe('story-one');
    expect(started.status).toBe('queued');
    expect(completed.status).toBe('completed');
    expect(completed.url).toContain('/stories/assets/');
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/stories');
    expect(fetcher.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).scenes[0].imagePrompt)
      .toBe('A beautiful forest at sunset');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/stories/story-one/scenes/scene-one/image');
    expect(fetcher.mock.calls[1][1].method).toBe('POST');
    expect(fetcher.mock.calls[2][0]).toBe('/api/v1/stories/story-one/scenes/scene-one/image/status');
    expect(fetcher.mock.calls[2][1].method).toBe('GET');
  });

  it('updates an existing story rather than creating duplicates', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ok({ id: 'saved-id' }));
    const id = await createStoryApi(fetcher as unknown as typeof fetch).saveStory(project, 'saved-id');
    expect(id).toBe('saved-id');
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/stories/saved-id');
    expect(fetcher.mock.calls[0][1].method).toBe('PUT');
  });

  it('lists and loads saved projects and reusable profile catalogs', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok({ items: [{ id: 'story-one', title: 'Luna', updatedAt: 'today' }] }))
      .mockResolvedValueOnce(ok({ id: 'story-one', title: 'Luna', scenes: [] }))
      .mockResolvedValueOnce(ok({ items: [{ id: 'character-one', name: 'Luna', description: 'Silver hair' }] }))
      .mockResolvedValueOnce(ok({ items: [{ id: 'voice-one', name: 'Luna voice', language: 'Thai' }] }));
    const api = createStoryApi(fetcher as unknown as typeof fetch);
    expect((await api.listStories())[0].id).toBe('story-one');
    expect((await api.getStory('story-one')).title).toBe('Luna');
    expect((await api.listCharacterProfiles())[0].name).toBe('Luna');
    expect((await api.listVoices())[0].id).toBe('voice-one');
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      '/api/v1/stories', '/api/v1/stories/story-one',
      '/api/v1/stories/character-profiles', '/api/v1/stories/voice-profiles',
    ]);
  });

  it('saves a character profile and starts/polls a MOSS narration job', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok({ id: 'character-one', name: 'Luna' }))
      .mockResolvedValueOnce(ok({ id: 'moss-job', status: 'queued' }))
      .mockResolvedValueOnce(ok({ status: 'completed', url: '/api/v1/stories/assets/audio.wav' }));
    const api = createStoryApi(fetcher as unknown as typeof fetch);
    await api.saveCharacterProfile({ name: 'Luna', description: 'Silver hair', referenceData: 'data:image/png;base64,iVBORw0KGgo=' });
    const job = await api.startSceneVoice('story-one', 'scene-one', 'voice-one');
    const result = await api.getSceneVoiceStatus('story-one', 'scene-one');
    expect(job.status).toBe('queued');
    expect(result.url).toContain('.wav');
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/stories/character-profiles');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).referenceData).toContain('base64');
    expect(JSON.parse(fetcher.mock.calls[1][1].body).voiceId).toBe('voice-one');
  });

  it('recovers when browser storage points to a deleted backend story', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(failed(404, 'Story not found'))
      .mockResolvedValueOnce(ok({ id: 'new-id' }));
    const id = await createStoryApi(fetcher as unknown as typeof fetch).saveStory(project, 'old-id');
    expect(id).toBe('new-id');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].method).toBe('POST');
  });

  it('stops before image generation if saving the story fails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(failed(500, 'Storage unavailable'));
    const api = createStoryApi(fetcher as unknown as typeof fetch);
    await expect(api.saveStory(project)).rejects.toThrow('Storage unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('exposes ComfyUI errors rather than silently creating a placeholder image', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(failed(503, 'ComfyUI rejected the prompt'));
    const api = createStoryApi(fetcher as unknown as typeof fetch);
    await expect(api.startSceneImage('story-one', 'scene-one'))
      .rejects.toThrow('ComfyUI rejected the prompt');
  });
});
