# Plan: Real Meta Postings Implementation (Media Uploads & Scheduling)

Implement a fully functional Meta posting interface supporting local media uploads, scheduling via calendar, and multi-platform preview (Feed, Reels, Stories).

## Proposed Changes

### Database & Backend
- Update `meta_scheduled_posts` table (if needed, though current schema is mostly sufficient) to support scheduling.
- Refactor `publishMetaContent` server function to handle:
    - Scheduling (persisting to DB as `pending` if a date is provided).
    - Differentiating between media types (IMAGE/VIDEO) and formats (Feed/Story/Reel).
    - *Note: Real scheduling requires a cron job or background worker to process 'pending' posts. For this phase, I will implement the UI and DB persistence for scheduling, and the direct publishing flow.*

### Frontend Integration
- **Media Upload**: Implement a local file uploader that uploads to Supabase Storage and provides a public URL for Meta.
- **Scheduling UI**: Add a calendar-based selection for "Postar Agora" vs "Agendar".
- **Format Selector**: Add options for Feed, Reels, and Stories.
- **Live Preview**: Enhanced preview for Videos and Images, covering both Facebook and Instagram layouts.
- **Video Handling**: Ensure Stories support up to 60s by using the correct Meta API parameters.

## User Review Required

> [!IMPORTANT]
> Meta APIs require a **publicly accessible URL** for media. I will implement an automatic upload to a public Supabase bucket to satisfy this requirement.

- **Scheduling**: Should I implement a basic server-side poller to "execute" scheduled posts, or just the UI/DB part for now?
- **Video Limits**: Meta's API for Stories supports 60s, but Reels can go longer. Do you have a specific maximum video size in mind? (Defaulting to 100MB).

## Technical Details
- **Storage**: New bucket `meta-media` in Supabase with public access.
- **Server Function**: Enhanced `src/lib/meta.functions.ts` with format-specific logic.
- **Components**: `react-calendar` for scheduling; `lucide-react` for enhanced iconography.
