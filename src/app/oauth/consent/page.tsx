import { McpOAuthConsent } from "@/components/oauth/McpOAuthConsent";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function McpOAuthConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: authorizationId } = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">ChatGPT?????</h1>
      <p className="mt-2 mb-8 text-sm text-gray-600">??????????LINE??bridge?????????????</p>
      {authorizationId ? <McpOAuthConsent authorizationId={authorizationId} /> : <p className="text-sm text-red-600">????????????????</p>}
    </main>
  );
}
