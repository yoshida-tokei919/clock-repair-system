import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createChatGptLineReplyMcpServer } from "@/lib/chatgpt-line-reply-mcp";
import { McpAuthConfigurationError, bearerToken, mcpUnauthorizedResponse, mcpUnavailableResponse, verifyMcpAccessToken } from "@/lib/chatgpt-mcp-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request) {
  const token = bearerToken(request);
  if (!token) return mcpUnauthorizedResponse();
  try {
    await verifyMcpAccessToken(token);
  } catch (error) {
    if (error instanceof McpAuthConfigurationError) return mcpUnavailableResponse();
    return mcpUnauthorizedResponse();
  }

  const server = createChatGptLineReplyMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
