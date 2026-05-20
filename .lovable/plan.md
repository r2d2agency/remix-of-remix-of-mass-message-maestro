I will improve the Google Calendar integration in the Legal Gleego system by enhancing the existing backend routes and frontend hooks to support reliable, bidirectional-like synchronization and local caching.

### Backend Enhancements (`backend/src/routes/google-calendar.js`)

1.  **Database Migration (Internal Logic)**: I will add logic to ensure the `google_calendar_events` and `google_oauth_tokens` tables have all required fields (e.g., `sync_token`, `source`, `attendees_json`, etc.) and create the `google_calendar_sync_logs` table.
2.  **Robust Synchronization (`/sync`)**:
    *   Implement a new `POST /sync` endpoint.
    *   Use `syncToken` for incremental sync when available.
    *   Iterate through all `selected_calendars`.
    *   Normalize and persist events into `google_calendar_events`, identifying external vs. CRM-created events.
    *   Update `meet_link`, status, and handle deletions (marking as cancelled/deleted).
3.  **Improved Event Management**:
    *   Refactor `GET /events` to return normalized data from the local cache (`google_calendar_events`) while ensuring it's fresh.
    *   Enhance `POST /events` and `POST /events-with-meet` to properly populate the new cache fields.
    *   Implement/Refine `PUT /events/:id` and `DELETE /events/:id` to sync changes to Google and update the local cache.
4.  **Sync Routine**:
    *   Implement a periodic background sync (initially triggered by certain actions or a simplified cron-like mechanism within the route file for now, or documented for the system's worker).
5.  **Logging**:
    *   Record sync details in `google_calendar_sync_logs` for audit and troubleshooting.

### Frontend Enhancements (`src/hooks/use-google-calendar.ts`)

1.  **New `useSyncGoogleCalendar` Hook**:
    *   Expose a method to trigger the background sync manually.
2.  **Update `useGoogleCalendarEvents`**:
    *   Ensure it fetches from the improved `/events` endpoint.
    *   Handle loading/error states gracefully.
3.  **UI Updates (Planned for subsequent steps)**:
    *   I will verify `src/components/settings/GoogleCalendarSettings.tsx` (or similar) to show sync status, last sync time, and a "Sync Now" button.

### Technical Details
- **Tables involved**: `google_oauth_tokens`, `google_calendar_events`, `google_calendar_sync_logs`.
- **Sync Logic**: Uses Google Calendar API's `nextSyncToken` for efficiency.
- **Normalization**: Maps Google's `Event` object to our internal `google_calendar_events` schema.

I will start by preparing the backend routes.
