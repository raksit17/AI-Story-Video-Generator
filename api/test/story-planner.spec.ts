import { planStoryboard, planSceneVisual } from "../src/stories/story-planner";

describe("Ollama Story Planner", () => {
  const originalFetch = global.fetch;
  const originalProvider = process.env.STORY_PROVIDER;
  const originalModel = process.env.OLLAMA_STORY_MODEL;
  const originalUrl = process.env.OLLAMA_URL;

  beforeEach(() => {
    process.env.STORY_PROVIDER = "ollama";
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_STORY_MODEL = "qwen3.5:4b";
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalProvider === undefined) delete process.env.STORY_PROVIDER;
    else process.env.STORY_PROVIDER = originalProvider;
    if (originalModel === undefined) delete process.env.OLLAMA_STORY_MODEL;
    else process.env.OLLAMA_STORY_MODEL = originalModel;
    if (originalUrl === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = originalUrl;
  });

  const result = {
    title: "ลูน่ากับประตูมิติ",
    synopsis: "ลูน่าติดอยู่ในสำนักงานและพบโลกใหม่",
    characters: [{ name: "ลูน่า", role: "protagonist", appearance: "Brown hair and a navy vest" }],
    scenes: Array.from({ length: 5 }, (_, i) => ({
      title: `เหตุการณ์ ${i + 1}`,
      narration: `ลูน่าพบประตูเรืองแสงภายในสำนักงานในฉากที่ ${i+1}`,
      imagePrompt: `Luna with brown hair and navy vest beside a glowing blue portal in an office, scene ${i+1}, anime cinematic lighting`,
      duration: 7, motion: "slow_zoom",
    })),
  };

  it("requests JSON storyboard from a local Qwen model and keeps narration/image prompt together", async () => {
    const mocked = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify(result) },
    }), { status: 200 }));
    global.fetch = mocked;
    const response = await planStoryboard({
      prompt: "ลูน่าทำงานในออฟฟิศจนพบประตูมิติแปลกประหลาด",
      language: "ไทย", genre: "Anime Fantasy", aspect: "9:16",
      character: { name: "ลูน่า", look: "Brown hair and navy vest" },
    });
    expect(response.scenes).toHaveLength(5);
    expect(response.scenes[0].imagePrompt).toContain("portal");
    expect(response.scenes[0].narration).toContain("สำนักงาน");
    expect(response.scenes[0].subtitle).toBe(response.scenes[0].narration);
    expect(new Set(response.scenes.map(s => s.id)).size).toBe(5);
    const [url, request] = mocked.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    const payload = JSON.parse(request.body);
    expect(payload.model).toBe("qwen3.5:4b");
    expect(payload.stream).toBe(false);
    expect(payload.format).toBe("json");
    expect(payload.messages[1].content).toContain("Brown hair and navy vest");
  });

  it("generates a scene visual from edited narration instead of unrelated boilerplate", async () => {
    const mocked = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify({ imagePrompt: "Luna stands inside an office looking back at a glowing blue portal, medium shot, blue lighting, brown hair" }) },
    }), { status: 200 }));
    global.fetch = mocked;
    const result = await planSceneVisual({
      narration: "ลูน่าตกใจเมื่อประตูมิติเรืองแสงอยู่ข้างหลัง",
      story: "ลูน่าติดอยู่ที่ทำงาน", title: "ประตูมิติ",
      genre: "Anime Fantasy", language: "ไทย", aspect: "9:16",
      character: { name: "ลูน่า", look: "Brown hair" },
    });
    expect(result.imagePrompt).toContain("glowing blue portal");
    expect(result.provider).toBe("ollama");
    const body = JSON.parse(mocked.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain("ลูน่าตกใจ");
  });

  it("reports model connection errors instead of returning placeholder scenes", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(planStoryboard({ prompt: "ลูน่าพบโลกแฟนตาซีใหม่" }))
      .rejects.toThrow("Story AI service unavailable");
  });

  it("rejects generated scenes with empty visual prompts", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify({ ...result, scenes: [
        { title: "bad", narration: "ลูน่าเห็นประตูมิติเกิดขึ้น", imagePrompt: "" },
        ...result.scenes.slice(1),
      ] }) },
    }), { status: 200 }));
    await expect(planStoryboard({ prompt: "ลูน่าพบประตูมิติในสำนักงาน" }))
      .rejects.toThrow("missing detailed narration or image prompt");
  });
});
