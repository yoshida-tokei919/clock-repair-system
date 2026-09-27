import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import SchedulerSettingsEditor from "@/components/settings/SchedulerSettingsEditor";

export const dynamic = "force-dynamic";

export default async function SchedulerSettingsPage() {
  if (!(await getServerSession(authOptions))?.user) redirect("/login");
  return <SchedulerSettingsEditor />;
}
