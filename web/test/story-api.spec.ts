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
  it('saves the story before generating its scene image', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok({ id: 'story-one' }))
      .mockResolvedValueOnce(ok({ url: '/api/v1/stories/assets/00000000-0000-0000-0000-000000000001.png' }));
    const api = createStoryApi(fetcher as unknown as typeof fetch);
    const id = await api.saveStory(project);
    const image = await api.generateSceneImage(id, 'scene-one');
    expect(id).toBe('story-one');
    expect(image).toContain('/stories/assets/');
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/stories');
    expect(fetcher.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).scenes[0].imagePrompt)
      .toBe('A beautiful forest at sunset');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/stories/story-one/scenes/scene-one/image');
    expect(fetcher.mock.calls[1][1].method).toBe('POST');
  });

  it('updates an existing story rather than creating duplicates', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ok({ id: 'saved-id' }));
    const id = await createStoryApi(fetcher as unknown as typeof fetch).saveStory(project, 'saved-id');
    expect(id).toBe('saved-id');
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/stories/saved-id');
    expect(fetcher.mock.calls[0][1].method).toBe('PUT');
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
    await expect(api.generateSceneImage('story-one', 'scene-one'))
      .rejects.toThrow('ComfyUI rejected the prompt');
  });
});
