import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

type Json = Record<string, any>;
export type ScenePlannerInput = {
  prompt: string; genre?: string; language?: string; aspect?: string; character?: string;
  sceneCount?: number;
};
export type VisualInput = {
  narration: string; title?: string; story?: string; genre?: string;
  language?: string; aspect?: string; character?: string;
};
type StoryProvider = "ollama" | "openai";
const getProvider = (): StoryProvider =>
  (process.env.STORY_PROVIDER || "ollama").toLowerCase() === "openai" ? "openai" : "ollama";

const storyboardRules = `You are a professional storyboard director and screenwriter.
Return a JSON object ONLY: {"title":"...","synopsis":"...","characters":[{"name":"...","role":"...","appearance":"..."}],"scenes":[{"title":"...","narration":"...","imagePrompt":"...","duration":7,"motion":"slow_zoom","subtitle":"..."}]}.
Make every scene one chronological, distinct visible event in the supplied story. Beginning, escalation, turning point, resolution. No generic filler (e.g. "mysterious discovery", "character introduced"), no invented plot unrelated to the idea.
Each narration explains what actually happens in that same scene, naturally in the requested narration language; suitable for voiceover.
Each imagePrompt describes the SAME scene as its narration, but AS A SINGLE VISIBLE STILL FRAME. Use detailed English image-generation vocabulary: characters and actions, visual setting, camera framing, art style, lighting, mood. Explicitly repeat character fixed appearance/outfit for every scene in which they appear. Never ask the image to show future events, sounds, thoughts, or written subtitles.
Make title, narration, imagePrompt, and subtitle specific and mutually consistent. For subtitles, use the narration exactly unless a shorter readable equivalent is appropriate.
Each scene is 5-12 seconds; write voiceover suitable for its duration. Produce the requested number of scenes. Do not use copyrighted characters or imitate living artists.`;
const visualRules = `You are an anime storyboard visual director. Respond ONLY as JSON {"imagePrompt":"..."}.
Convert the given narration into ONE precise, drawable still image for ComfyUI SDXL. The actual visible action, location, character pose/expression, camera shot, lighting, time of day and style must match narration and story context. Write the imagePrompt IN ENGLISH even if narration is Thai. Include fixed character design details. Do not place captions, words, or abstract thoughts in the image. No generic boilerplate.`;

function nonempty(value: unknown, max = 3000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function decode(text: string): Json {
  const trimmed = text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); }
  catch { throw new ServiceUnavailableException("Story AI returned invalid JSON. Please retry or use another model."); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
    throw new ServiceUnavailableException("Story AI returned an invalid response.");
  return parsed as Json;
}
export function normalizeStoryboard(text: string, sceneCount: number) {
  const parsed = decode(text);
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 3 || parsed.scenes.length > 12)
    throw new ServiceUnavailableException("Story AI returned an invalid number of scenes.");
  const scenes = parsed.scenes.map((item: unknown, index: number) => {
    const scene = item && typeof item === "object" ? item as Json : {};
    const narration = nonempty(scene.narration, 1200);
    const imagePrompt = nonempty(scene.imagePrompt, 1800);
    if (narration.length < 10 || imagePrompt.length < 25)
      throw new ServiceUnavailableException(`Scene ${index + 1} is missing detailed narration or image prompt; please retry.`);
    return {
      id: randomUUID(),
      title: nonempty(scene.title, 120) || `Scene ${index + 1}`,
      narration, imagePrompt,
      subtitle: nonempty(scene.subtitle, 1200) || narration,
      duration: Math.min(20, Math.max(5, Number(scene.duration) || 7)),
      motion: nonempty(scene.motion, 60) || "slow_zoom",
    };
  });
  return {
    title: nonempty(parsed.title, 120) || "Untitled story",
    synopsis: nonempty(parsed.synopsis, 1600),
    characters: Array.isArray(parsed.characters)
      ? parsed.characters.slice(0, 12).map((ch: unknown) => {
        const row = ch && typeof ch === "object" ? ch as Json : {};
        return { name: nonempty(row.name, 80), role: nonempty(row.role, 150), appearance: nonempty(row.appearance, 900) };
      }) : [],
    scenes,
    planner: getProvider(),
    requestedSceneCount: sceneCount,
  };
}

async function requestJson(url: string, init: RequestInit): Promise<Json> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(180000) }); }
  catch (error) { throw new ServiceUnavailableException(`Story AI service unavailable: ${String(error)}. Check Ollama and its model.`); }
  if (!response.ok) {
    const message = (await response.text()).slice(0, 350);
    throw new ServiceUnavailableException(`Story AI HTTP ${response.status}: ${message}`);
  }
  try { return await response.json() as Json; }
  catch { throw new ServiceUnavailableException("Story AI returned malformed HTTP JSON."); }
}

export async function storyAiJson(system: string, input: unknown): Promise<string> {
  const provider = getProvider();
  const messages = [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(input) },
  ];
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new ServiceUnavailableException("STORY_PROVIDER=openai requires OPENAI_API_KEY");
    const data = await requestJson("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.STORY_MODEL || "gpt-4o-mini", messages, response_format: { type: "json_object" }, temperature: 0.55 }),
    });
    const value = data.choices?.[0]?.message?.content;
    if (typeof value !== "string" || !value.trim())
      throw new ServiceUnavailableException("OpenAI returned no story content.");
    return value;
  }
  const base = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_STORY_MODEL || "qwen3.5:4b";
  const data = await requestJson(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, format: "json", think: false,
      options: { temperature: 0.5, num_predict: 3600 } }),
  });
  const value = data.message?.content;
  if (typeof value !== "string" || !value.trim())
    throw new ServiceUnavailableException("Ollama returned no content. Check model support for JSON format and think:false.");
  return value;
}

export async function planStoryboard(input: Record<string, unknown>) {
  const prompt = nonempty(input.prompt, 4001);
  if (prompt.length < 8 || prompt.length > 4000)
    throw new BadRequestException("Story idea must be 8–4000 characters");
  const sceneCount = Math.min(8, Math.max(3, Math.round(Number(input.sceneCount) || 5)));
  const character = input.character && typeof input.character === "object"
    ? input.character as Json : {};
  const source: ScenePlannerInput = {
    prompt, genre: nonempty(input.genre, 100), language: nonempty(input.language, 30) || "ไทย",
    aspect: nonempty(input.aspect, 10) || "9:16",
    character: [nonempty(character.name, 80), nonempty(character.look, 500)].filter(Boolean).join(": "),
    sceneCount,
  };
  const text = await storyAiJson(storyboardRules, source);
  return normalizeStoryboard(text, sceneCount);
}

export async function planSceneVisual(input: Record<string, unknown>) {
  const narration = nonempty(input.narration, 1501);
  if (narration.length < 8 || narration.length > 1500)
    throw new BadRequestException("Narration must be 8–1500 characters");
  const character = input.character && typeof input.character === "object"
    ? input.character as Json : {};
  const payload: VisualInput = {
    narration, title: nonempty(input.title, 120), story: nonempty(input.story, 1000),
    genre: nonempty(input.genre, 100), language: nonempty(input.language, 30), aspect: nonempty(input.aspect, 10),
    character: [nonempty(character.name, 80), nonempty(character.look, 500)].filter(Boolean).join(": "),
  };
  const generated = decode(await storyAiJson(visualRules, payload));
  const imagePrompt = nonempty(generated.imagePrompt, 1800);
  if (imagePrompt.length < 25)
    throw new ServiceUnavailableException("Story AI did not return a detailed visual prompt.");
  return { imagePrompt, provider: getProvider() };
}
