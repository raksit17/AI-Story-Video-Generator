# Validation

Validated in the build environment with Node.js 24.19.0 on Linux:

- `npm run build`: passed.
- `npm test`: passed, 2 suites / 12 tests.
- Real FFmpeg/FFprobe: generated an MP4, extracted requested frames, verified JPEG dimensions 1280×720.
- Nest HTTP: API key, CORS preflight, local video registration/list/read, invalid input rejection, Thai Draft JSON round-trip, revision conflict handling, deletion.
- Image upload: PNG alpha preserved, fake PNG rejected, wrong export size rejected, JPEG export downloaded.
- Source containment: symlinks escaping the source directory rejected.
- Highlight integration: tested against an HTTP fixture matching the inspected repository's `/api/v1/videos` contract, including pagination, not-found and upstream failure.
- Missing FFprobe binary: returns 503 with configuration guidance.

Not exercised here: a live PostgreSQL instance, the user's live highlight API/database or video files, Docker build/runtime, Windows execution, or a Vue/Konva UI. Database integration tests use pg-mem. Run `npm run db:migrate` and `/api/v1/health` against your configured PostgreSQL before first use.
