import { NextRequest, NextResponse } from "next/server";

function normalizePostalCode(value: string) {
  return value
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, "");
}

export async function GET(request: NextRequest) {
  const postalCode = normalizePostalCode(request.nextUrl.searchParams.get("zipcode") ?? "");
  if (!/^\d{7}$/.test(postalCode)) {
    return NextResponse.json({ error: "郵便番号は7桁の数字で入力してください。" }, { status: 400 });
  }

  try {
    const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("郵便番号検索サービスへの接続に失敗しました。");

    const data = await response.json() as {
      results?: Array<{ address1?: string; address2?: string; address3?: string }> | null;
    };
    const result = data.results?.[0];
    if (!result?.address1 || !result.address2) {
      return NextResponse.json({ error: "該当する住所が見つかりませんでした。" }, { status: 404 });
    }

    return NextResponse.json({
      prefecture: result.address1,
      city: result.address2,
      street: result.address3 ?? "",
    });
  } catch {
    return NextResponse.json({ error: "住所の自動入力に失敗しました。住所を直接入力してください。" }, { status: 502 });
  }
}
