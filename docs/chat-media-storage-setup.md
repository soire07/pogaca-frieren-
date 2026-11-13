# Frieren chat media storage (Supabase Free)

Chat attachments use a dedicated Supabase Storage project on the **Free** plan. The bucket stays private. The Render service signs S3-compatible upload/download/delete requests; the browser never receives storage credentials. Neon stores only attachment metadata and message relationships.

## Free-plan setup (one time)

1. Open https://supabase.com/dashboard and create a new organization/project using the **Free** plan. Name the project **frieren-chat-media**.
2. Keep this project dedicated to chat media. Do not store unrelated application data in it.
3. Open **Storage → Buckets → New bucket** and create **frieren-chat-media**.
4. Keep **Public bucket** disabled. Set the maximum file size to 24 MB (the app's largest supported file). Restrict allowed MIME types to:
   - image/jpeg, image/png, image/webp, image/gif
   - video/mp4, video/webm
   - audio/mpeg, audio/ogg, audio/wav, audio/flac, audio/webm
5. Open **Storage → Settings → S3 Connection**. Enable the S3 protocol and generate an Access Key ID and Secret Access Key. Copy the endpoint and region shown there. The endpoint should use the direct storage hostname and end in /storage/v1/s3, for example https://<project-ref>.storage.supabase.co/storage/v1/s3.
6. In Render service **pogaca-frieren**, add these environment variables. Keep the secret key only in Render; never commit it to GitHub or paste it into chat.

| Environment variable | Value |
| --- | --- |
| CHAT_MEDIA_SUPABASE_ENDPOINT | Supabase S3 endpoint from Storage settings |
| CHAT_MEDIA_SUPABASE_REGION | Region shown in S3 settings |
| CHAT_MEDIA_SUPABASE_BUCKET | frieren-chat-media |
| CHAT_MEDIA_SUPABASE_ACCESS_KEY_ID | Generated S3 Access Key ID |
| CHAT_MEDIA_SUPABASE_SECRET_ACCESS_KEY | Generated S3 Secret Access Key |

7. Save the environment changes and allow the normal Render restart. No Vercel environment variables are required.

## Free-only and security safeguards

- Keep the Supabase organization/project on **Free**. Do not add paid compute, add-ons, or upgrade the plan.
- Supabase Free currently includes 1 GB file storage, 5 GB uncached egress and 5 GB cached egress; its Free projects can pause after one week of inactivity.
- Free-plan quota overruns trigger service restrictions after notice/grace handling; do not upgrade to clear them. The app's own object metadata ceiling is lower: 900 MiB, leaving headroom below the 1 GB storage quota.
- The app rejects further uploads when its 900 MiB total metadata ceiling or 150 MiB per-account rolling 24-hour limit is reached. Per-file limits remain: images 8 MiB, video 24 MiB, audio 16 MiB.
- Supabase S3 access keys have full access to all buckets in their Supabase project and bypass Storage RLS. This is why the project must be dedicated to this one private chat bucket; never reuse its credentials elsewhere.
- Only the Render backend holds the S3 keys. Existing chat account, friend, group membership, CSRF, file signature and MIME checks remain in force.
- Downloads use time-limited signed URLs. They are bearer links while valid; do not share them outside the authorized conversation.
- Files are not stored as BYTEA in Neon PostgreSQL. PostgreSQL stores only metadata and message relationships.
- Keep the bucket private; do not make it public to work around a failed upload.

## Validation

After adding the environment variables, test one image, one video and one audio file using test accounts. Confirm direct-message attachments are visible only to the two participants and group attachments only to group members. Confirm upload rejection at the app's configured quota. Then verify Vercel-to-Render SSE separately; SSE does not depend on the media provider.

Official references:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/storage/s3/authentication
- https://supabase.com/docs/guides/storage/s3/compatibility
- https://supabase.com/docs/guides/storage/serving/downloads
- https://supabase.com/docs/guides/platform/billing-faq
