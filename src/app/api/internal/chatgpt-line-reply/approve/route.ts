import { NextRequest } from "next/server";
import { bridgeRoute } from "../_route";
import { approveReply, parseApproval } from "@/lib/chatgpt-line-reply-bridge";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  return bridgeRoute(request, (body) => approveReply(prisma, parseApproval(body)));
}
