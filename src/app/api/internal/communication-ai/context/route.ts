import { NextRequest } from "next/server";
import { communicationAiRoute } from "../_route";
import { getCommunicationAiContext, parseCommunicationAiTarget } from "@/lib/communication-ai-brief";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return communicationAiRoute(request, async (body) => {
    const target = parseCommunicationAiTarget(body);
    return getCommunicationAiContext(prisma, target);
  });
}
