import { handlePhysicalTagAction } from "@/lib/physical-tag-lifecycle-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handlePhysicalTagAction(request, "release");
}
