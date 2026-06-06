import Link from "next/link";
import { ArrowLeft, ImageOff } from "lucide-react";
import { notFound } from "next/navigation";
import {
  getB2CPublicCaseDetail,
  type B2CPublicCaseDetail,
} from "@/lib/public-cases";

export const dynamic = "force-dynamic";

function text(value?: string | null): string {
  return (value ?? "").trim();
}

function getBrandDisplayName(publicCase: B2CPublicCaseDetail): string {
  return text(publicCase.brandDisplayName) || text(publicCase.brandName);
}

function getWorkNames(publicCase: B2CPublicCaseDetail): string[] {
  const names = publicCase.workItems
    .filter((workItem) => workItem.isPublishable)
    .map((workItem) => text(workItem.b2cDisplayName))
    .filter(Boolean)
    .map((name) => name.replace(/技術料/g, "").trim())
    .filter(Boolean);

  return Array.from(new Set(names));
}

function getPartNames(publicCase: B2CPublicCaseDetail): string[] {
  const names = publicCase.partItems
    .map((partItem) => text(partItem.displayName))
    .filter(Boolean);

  return Array.from(new Set(names));
}

function getTitle(publicCase: B2CPublicCaseDetail, fallbackWorkName: string): string {
  return (
    text(publicCase.modelName) ||
    (text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "") ||
    (text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "") ||
    fallbackWorkName ||
    "修理事例"
  );
}

function getMeta(publicCase: B2CPublicCaseDetail): string {
  return [
    text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "",
    text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

function DetailImage({ publicCase }: { publicCase: B2CPublicCaseDetail }) {
  const image = publicCase.images[0];
  const src = text(image?.url);
  const brand = getBrandDisplayName(publicCase);
  const title = text(publicCase.modelName) || text(publicCase.ref) || "修理事例";

  if (src) {
    return (
      <img
        src={src}
        alt={`${brand ? `${brand} ` : ""}${title}`}
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 to-stone-200">
      <ImageOff className="h-10 w-10 text-neutral-400" aria-hidden="true" />
    </div>
  );
}

export default async function PublicCaseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const publicCase = await getB2CPublicCaseDetail(params.id);
  if (!publicCase) {
    notFound();
  }

  const brand = getBrandDisplayName(publicCase);
  const workNames = getWorkNames(publicCase);
  const partNames = getPartNames(publicCase);
  const primaryWorkName = workNames[0] ?? "修理内容確認中";
  const title = getTitle(publicCase, primaryWorkName);
  const meta = getMeta(publicCase);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <div className="mb-8">
        <Link
          href="/cases/gallery"
          className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700 hover:text-blue-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          修理事例ギャラリーへ戻る
        </Link>
      </div>

      <article className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="aspect-[4/3] bg-neutral-100 lg:aspect-auto">
            <DetailImage publicCase={publicCase} />
          </div>

          <div className="space-y-7 p-6 md:p-8">
            <header className="space-y-3">
              {brand ? (
                <p className="text-xl font-bold leading-tight text-blue-950">
                  {brand}
                </p>
              ) : null}
              <h1 className="text-2xl font-bold leading-snug text-neutral-950 md:text-3xl">
                {title}
              </h1>
              {meta ? (
                <p className="text-base font-medium text-neutral-700">{meta}</p>
              ) : null}
            </header>

            <section className="space-y-3 border-t border-neutral-100 pt-6">
              <h2 className="text-sm font-semibold tracking-[0.16em] text-neutral-500">
                修理内容
              </h2>
              <ul className="space-y-2 text-base leading-7 text-neutral-900">
                {workNames.length > 0 ? (
                  workNames.map((name) => <li key={name}>{name}</li>)
                ) : (
                  <li>{primaryWorkName}</li>
                )}
              </ul>
            </section>

            {partNames.length > 0 ? (
              <section className="space-y-3 border-t border-neutral-100 pt-6">
                <h2 className="text-sm font-semibold tracking-[0.16em] text-neutral-500">
                  交換部品
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {partNames.map((name) => (
                    <li
                      key={name}
                      className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-800"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p className="border-t border-neutral-100 pt-6 text-sm leading-7 text-neutral-500">
              掲載内容は一例です。時計の状態や部品の入手状況により、必要な作業内容は異なります。
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
