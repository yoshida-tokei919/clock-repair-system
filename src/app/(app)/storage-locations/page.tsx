import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StorageLocationsPage({
  searchParams,
}: {
  searchParams: { location?: string };
}) {
  const locations = await prisma.storageLocation.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      shortCode: true,
      locationType: true,
      _count: { select: { assignments: { where: { releasedAt: null } } } },
    },
  });

  const selectedId = /^\d+$/.test(searchParams.location ?? "")
    ? Number(searchParams.location)
    : null;
  const selected = locations.find((location) => location.id === selectedId);
  const assignments = selected
    ? await prisma.storageLocationAssignment.findMany({
        where: { storageLocationId: selected.id, releasedAt: null },
        orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          assignedAt: true,
          repair: {
            select: {
              id: true,
              inquiryNumber: true,
              status: true,
              watch: {
                select: {
                  modelNameInput: true,
                  brand: { select: { name: true, nameJp: true } },
                  model: { select: { name: true, nameJp: true } },
                },
              },
            },
          },
        },
      })
    : [];

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">保管場所一覧</h1>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="p-3">保管場所</th>
              <th className="p-3">管理コード</th>
              <th className="p-3">種別</th>
              <th className="p-3 text-right">現在の修理件数</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => (
              <tr key={location.id} className="border-b last:border-0">
                <td className="p-3">
                  <Link className="text-blue-700 hover:underline" href={`/storage-locations?location=${location.id}`}>
                    {location.name}
                  </Link>
                </td>
                <td className="p-3">{location.shortCode ?? "未設定"}</td>
                <td className="p-3">{location.locationType}</td>
                <td className="p-3 text-right">{location._count.assignments}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {locations.length === 0 && <p className="p-4 text-sm text-gray-600">有効な保管場所がありません。</p>}
      </div>

      {selected && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{selected.name} の修理一覧（{selected._count.assignments}件）</h2>
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="p-3">問い合わせ番号</th>
                  <th className="p-3">ブランド</th>
                  <th className="p-3">モデル</th>
                  <th className="p-3">Repair.status</th>
                  <th className="p-3">割当日時</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map(({ id, repair, assignedAt }) => (
                  <tr key={id} className="border-b last:border-0">
                    <td className="p-3">
                      <Link className="text-blue-700 hover:underline" href={`/repairs/${repair.id}`}>
                        {repair.inquiryNumber}
                      </Link>
                    </td>
                    <td className="p-3">{repair.watch.brand.nameJp || repair.watch.brand.name}</td>
                    <td className="p-3">{repair.watch.model?.nameJp || repair.watch.model?.name || repair.watch.modelNameInput || "未登録"}</td>
                    <td className="p-3">{repair.status}</td>
                    <td className="p-3">{assignedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {assignments.length === 0 && <p className="p-4 text-sm text-gray-600">現在の修理案件はありません。</p>}
          </div>
        </section>
      )}
    </div>
  );
}
