import { NextRequest } from "next/server";
import { communicationAiRoute } from "../_route";
import { saveCommunicationAiBrief } from "@/lib/communication-ai-brief";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return communicationAiRoute(request, async (body) => {
    const result = await saveCommunicationAiBrief(prisma, body);
    return {
      deduplicated: result.deduplicated,
      stale: result.stale,
      brief: {
        id: result.brief.id,
        createdAt: result.brief.createdAt,
      },
    };
  });
}
