-- Task206H2: OAuth tokens issued for the dedicated ChatGPT MCP account need
-- the MCP resource as their JWT audience. The hook is inert for every other
-- authentication flow and user.
create or replace function public.chatgpt_mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if event ->> 'authentication_method' = 'oauth_provider/authorization_code'
     and nullif(claims ->> 'client_id', '') is not null
     and claims #>> '{app_metadata,mcp_line_reply}' = 'true' then
    claims := jsonb_set(
      claims,
      '{aud}',
      to_jsonb('https://yoshidawatchrepair.com/mcp'::text),
      true
    );
  end if;

  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.chatgpt_mcp_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.chatgpt_mcp_access_token_hook(jsonb) from public, anon, authenticated;
