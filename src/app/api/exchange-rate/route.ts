import { NextResponse } from 'next/server'

export async function GET() {
  const [gbp, usd, eur] = await Promise.all([
    fetch('https://api.frankfurter.app/latest?from=GBP&to=JPY', { next: { revalidate: 86400 } }).then(r => r.json()),
    fetch('https://api.frankfurter.app/latest?from=USD&to=JPY', { next: { revalidate: 86400 } }).then(r => r.json()),
    fetch('https://api.frankfurter.app/latest?from=EUR&to=JPY', { next: { revalidate: 86400 } }).then(r => r.json()),
  ])
  return NextResponse.json({
    GBP: Math.round(gbp.rates.JPY),
    USD: Math.round(usd.rates.JPY),
    EUR: Math.round(eur.rates.JPY),
    JPY: 1,
    updatedAt: gbp.date, // 例: "2026-04-23"
  })
}
