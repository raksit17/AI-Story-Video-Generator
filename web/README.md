# Web — AI Story Video Generator

Frontend built with Vue 3, TypeScript, and Vite. The Storyframe workspace supports a local storyboard draft, scene editing and ordering, image uploads, character reference notes, production and YouTube preparation screens, and JSON project import/export.

## Run

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. The project saves its current draft in browser storage.

## API connection

The storyboard form calls `POST /api/v1/stories/generate`. If the API route is not available, it creates a local sample storyboard so the editing flow remains usable. Image generation, voice generation, video rendering, and YouTube upload require the corresponding API providers and credentials to be configured.
