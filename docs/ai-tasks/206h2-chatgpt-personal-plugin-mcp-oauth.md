# Task206H2 ? ChatGPT Personal Plugin / MCP / OAuth

Status: local implementation complete / independent review and production activation pending

## Goal

Use the Task206H1 LINE reply bridge from ChatGPT without Desktop Commander.

Normal path:

`ChatGPT Personal Plugin -> authenticated remote MCP -> Task206H1 bridge -> APPROVED LineManagerSendOutbox -> existing Windows lineoa sender -> reconciliation -> CONFIRMED InquiryMessage`

The MCP layer never calls LINE or lineoa directly and never creates an InquiryMessage directly.

## Tool surface

- `get_line_reply_context`
  - read only
  - gets the current Inquiry/Repair conversation and approval fingerprint
- `approve_line_reply`
  - external write / consequential send
  - queues only the exact text approved against the current fingerprint
  - deterministic/idempotent through Task206H1
- `get_line_reply_status`
  - read only
  - `CONFIRMED` is the only `sent=true` state

MCP results intentionally omit Manager IDs, externalMessageId, sendId, LineUser IDs, customer IDs, file object keys, raw errors, auth tokens, and other unnecessary internal identifiers.

## Authentication boundary

The existing application administrator login remains NextAuth Credentials and is not changed.

ChatGPT linking uses a separate dedicated Supabase Auth user and Supabase OAuth 2.1 Server.

The MCP resource server accepts a token only when all of these match:

- valid Supabase-signed token
- issuer = current project `/auth/v1`
- audience = `https://yoshidawatchrepair.com/mcp`
- client_id = the one statically registered ChatGPT OAuth client
- subject = the one configured dedicated Supabase Auth user
- role = `authenticated`
- `app_metadata.mcp_line_reply = true`
- token not expired

The OAuth consent UI also requires the same dedicated user, exact OAuth client ID, and exact registered ChatGPT callback URI.

## Endpoints

- `POST/GET/DELETE /mcp` ? stateless Streamable HTTP MCP endpoint
- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-protected-resource/mcp`
- `GET /oauth/consent?authorization_id=...` ? dedicated Supabase Auth consent UI
- `POST /api/oauth/consent/details`
- `POST /api/oauth/consent/decision`

## Production environment variables

Required before activating MCP:

- `MCP_RESOURCE_URL=https://yoshidawatchrepair.com/mcp`
- `MCP_OAUTH_CLIENT_ID=<Supabase OAuth client UUID>`
- `MCP_OAUTH_REDIRECT_URI=<exact callback URI shown by ChatGPT Plugin setup>`
- `MCP_ALLOWED_USER_ID=<dedicated Supabase Auth user UUID>`

Existing `NEXT_PUBLIC_SUPABASE_URL` and publishable/anon key are reused only for Supabase Auth verification and consent calls.

## Supabase production activation ? DO NOT perform before independent review and explicit approval

1. Apply migration `20261009_add_chatgpt_mcp_access_token_hook`.
2. Enable the Custom Access Token Hook `public.chatgpt_mcp_access_token_hook` in Authentication > Hooks.
3. Enable Supabase OAuth 2.1 Server.
4. Set authorization path to `https://yoshidawatchrepair.com/oauth/consent`.
5. Keep Dynamic Client Registration disabled.
6. Create one dedicated Supabase Auth user for this integration.
7. Set only that user's app metadata `mcp_line_reply=true`.
8. In ChatGPT Personal Plugin setup, obtain the exact callback URI.
9. Register one static Supabase OAuth client with that exact callback URI.
10. Configure the four Railway MCP environment variables above.
11. Deploy and smoke-test OAuth protected-resource discovery and unauthorized `/mcp` challenge before linking ChatGPT.
12. Connect the Personal Plugin, complete OAuth consent, inspect tools, then run a read-only context test.
13. Only after explicit user approval, run one self-LINE send test and confirm the approval reaches `CONFIRMED` exactly once.

Do not enable DCR, do not share the existing `N8N_INTERNAL_TOKEN` with ChatGPT, and do not expose the existing internal H1 HTTP routes as MCP tools.

## Custom Access Token Hook

The migration creates a no-table auth hook function. It is a no-op unless both conditions hold:

- authentication method is an OAuth authorization-code issuance
- token app metadata contains `mcp_line_reply=true`

Only in that case it sets `aud` to `https://yoshidawatchrepair.com/mcp`. Execute permission is granted to `supabase_auth_admin` and revoked from `public`, `anon`, and `authenticated`.

No public table is created, so the post-2026-10-30 Data API table GRANT rule is not applicable to this migration.

## Risk boundary

This Task changes an authentication boundary and includes a migration/Auth Hook. Final production activation therefore requires a reviewer different from the implementer. Katari completed the H2 implementation after Codex had reached its usage limit, so the current final H2 state must be treated as `?????????` until that review occurs.
