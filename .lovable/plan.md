The user is experiencing an issue where incoming WhatsApp messages via the new UAZAPI connection are being received by the UAZAPI server but are not appearing in the chat screen. This likely stems from a mismatch in how the system identifies the connection or the conversation when a webhook arrives, or a mismatch in the JID format (e.g., `@c.us` vs `@s.whatsapp.net`).

I will:
1.  **Improve JID Normalization**: Update `normalizeJid` to consistently handle both `@c.us` (used by some UAZAPI versions) and `@s.whatsapp.net` (standard used in our DB), ensuring conversations are correctly matched across providers.
2.  **Enhance Connection Discovery**: Update `findUazapiConnection` to be more robust, searching for the connection by token, instance name, or phone number in a more comprehensive way.
3.  **Add Webhook Diagnostics**: Add detailed logging for incoming UAZAPI webhooks to help identify if a connection is not being found or if processing is failing for a specific reason.
4.  **Ensure organization_id in Sockets**: Ensure that when a message is received, it is emitted to the correct organization room even if the connection's `organization_id` was previously missing or NULL.

**Technical Details:**
- Edit `backend/src/routes/uazapi.js`:
    - Refactor `normalizeJid` to strip `@c.us` and `@s.whatsapp.net` before re-applying the standard suffix.
    - Update `findUazapiConnection` to check more fields from the UAZAPI payload.
    - Add `logInfo` calls in the `/webhook` route to trace the incoming data and connection matching.
    - Ensure `organization_id` is fetched if not present in the cached connection object during socket emission.
