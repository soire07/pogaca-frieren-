# Frieren chat media storage (Cloudflare R2)

Chat attachments use a private Cloudflare R2 bucket. The application uploads the raw file through the existing Render service, so the browser never receives an R2 API key and the bucket does not need public access or browser CORS rules.

## One-time setup

1. In Cloudflare, open **R2 Object Storage** and create a **Standard** bucket, for example `frieren-chat-media`.
2. Keep public access disabled.
3. Create an R2 API token restricted to this bucket with **Object Read & Write** permissions. Do not create an account-wide administrator token.
4. In the Render service `pogaca-frieren`, add these environment variables. Store the secret key only in Render; never commit it to GitHub or paste it into chat.

| Environment variable | Value |
| --- | --- |
| `CHAT_MEDIA_R2_ACCOUNT_ID` | Cloudflare account ID (32 hexadecimal characters) |
| `CHAT_MEDIA_R2_BUCKET` | Exact bucket name |
| `CHAT_MEDIA_R2_ACCESS_KEY_ID` | R2 token access key ID |
| `CHAT_MEDIA_R2_SECRET_ACCESS_KEY` | R2 token secret access key |

5. Save the environment changes and allow the normal Render service restart. No Vercel environment variables are required because Vercel forwards site requests to Render.

Until all four variables are present, the chat upload route deliberately returns `503 media_storage_not_configured`; text chat continues to work.

## Limits and safeguards

- Private bucket; downloads use short-lived, signed GET URLs.
- Only allowlisted image, video and audio MIME types with file-signature checks.
- Per-file limits: images 8 MiB, video 24 MiB, audio 16 MiB.
- Per-account upload ceiling: 150 MiB per rolling 24 hours.
- Application-wide metadata ceiling: 8.5 GB, leaving headroom below R2's 10 GB-month free storage allowance.
- Files are not stored as BYTEA in Neon PostgreSQL. PostgreSQL stores only metadata and the message relationship.
- The 8.5 GB cap applies to this app's metadata table and dedicated bucket; Cloudflare's free allowance is shared across the entire Cloudflare account, including any other R2 buckets. Existing account usage can therefore reduce the remaining free allowance.
- No automatic billing or paid upgrade is configured by this code. R2 usage beyond the free allowance is billable at Cloudflare's published rates, so monitor storage and operation usage in the Cloudflare dashboard.

Cloudflare currently lists Standard R2 free allowances of 10 GB-month storage, 1 million Class A requests, 10 million Class B requests and free egress: https://developers.cloudflare.com/r2/pricing/

Presigned upload/download URLs follow Cloudflare's S3-compatible API and are generated server-side: https://developers.cloudflare.com/r2/api/s3/presigned-urls/

## Validation

After adding the environment variables, test one image, one video and one audio file in the test account before enabling this on the production site. Confirm that direct messages are visible only to the two participants and group attachments only to group members. Do not make the bucket public to work around a failed upload.
