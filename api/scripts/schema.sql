CREATE SCHEMA IF NOT EXISTS thumbnail_editor;
CREATE TABLE IF NOT EXISTS thumbnail_editor.local_videos (
 id text PRIMARY KEY, "externalId" text UNIQUE NOT NULL, title text NOT NULL,
 "durationMs" integer, "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS thumbnail_editor.assets (
 id uuid PRIMARY KEY, "videoId" text NOT NULL, kind text NOT NULL CHECK (kind IN ('frame','image','export')),
 filename text UNIQUE NOT NULL, "mimeType" text NOT NULL, width integer NOT NULL, height integer NOT NULL,
 "timestampMs" integer, "sizeBytes" integer NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS thumbnail_assets_video_kind ON thumbnail_editor.assets ("videoId", kind, "createdAt");
CREATE TABLE IF NOT EXISTS thumbnail_editor.drafts (
 id uuid PRIMARY KEY, "videoId" text NOT NULL, name text NOT NULL, document jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS thumbnail_drafts_video ON thumbnail_editor.drafts ("videoId", "updatedAt");
-- Deliberately no FK to public.videos: catalog may be supplied by HTTP or another database.

-- Phase 3 durable queue. No changes to public.* or existing assets/drafts.
CREATE TABLE IF NOT EXISTS thumbnail_editor.ai_jobs (
 id uuid PRIMARY KEY, "videoId" text NOT NULL, "requestId" uuid UNIQUE NOT NULL,
 status text NOT NULL, input jsonb NOT NULL, state jsonb NOT NULL,
 "cancelRequested" boolean NOT NULL DEFAULT false,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS thumbnail_ai_jobs_video ON thumbnail_editor.ai_jobs ("videoId", "createdAt");
CREATE INDEX IF NOT EXISTS thumbnail_ai_jobs_status ON thumbnail_editor.ai_jobs (status, "createdAt");
