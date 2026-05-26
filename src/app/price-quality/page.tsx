import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "価格と修理品質 | 吉田時計修理工房",
  description:
    "費用を抑えながらも、分解・洗浄・注油・調整・確認など必要な工程を省略しない修理を心がけています。",
};

const LINE_URL = "https://lin.ee/3C0XfJW";

const priceRows = [
  {
    brand: "ROLEX",
    quartzMaker: "-",
    quartzShop: "-",
    mechanicalMaker: "88,000円〜",
    mechanicalShop: "30,000円〜",
    chronoMaker: "100,000円〜",
    chronoShop: "50,000円〜",
    note: "モデル・年代で変動あり",
  },
  {
    brand: "OMEGA",
    quartzMaker: "70,000円〜",
    quartzShop: "16,000円〜",
    mechanicalMaker: "90,000円〜",
    mechanicalShop: "25,000円〜",
    chronoMaker: "115,000円〜",
    chronoShop: "40,000円〜",
    note: "コーアクシャルは高め",
  },
  {
    brand: "TAG Heuer",
    quartzMaker: "35,000円〜",
    quartzShop: "16,000円〜",
    mechanicalMaker: "55,000円〜",
    mechanicalShop: "25,000円〜",
    chronoMaker: "85,000円〜",
    chronoShop: "40,000円〜",
    note: "正規会員価格あり(約3割安)",
  },
  {
    brand: "BREITLING",
    quartzMaker: "50,000円〜",
    quartzShop: "16,000円〜",
    mechanicalMaker: "80,000円〜",
    mechanicalShop: "30,000円〜",
    chronoMaker: "120,000円〜",
    chronoShop: "40,000円〜",
    note: "正規会員価格あり(半額)",
  },
  {
    brand: "IWC",
    quartzMaker: "50,000円〜",
    quartzShop: "16,000円〜",
    mechanicalMaker: "70,000円〜",
    mechanicalShop: "30,000円〜",
    chronoMaker: "95,000円〜",
    chronoShop: "50,000円〜",
    note: "-",
  },
  {
    brand: "Cartier",
    quartzMaker: "45,000円〜",
    quartzShop: "20,000円〜",
    mechanicalMaker: "55,000円〜",
    mechanicalShop: "30,000円〜",
    chronoMaker: "80,000円〜",
    chronoShop: "50,000円〜",
    note: "-",
  },
  {
    brand: "Grand Seiko",
    quartzMaker: "40,000円〜",
    quartzShop: "16,000円〜",
    mechanicalMaker: "55,000円〜",
    mechanicalShop: "25,000円〜",
    chronoMaker: "85,000円〜",
    chronoShop: "40,000円〜",
    note: "スプリングドライブは6万円〜",
  },
];

export default function PriceQualityPage() {
  return (
    <main className="price-quality-page">
      <header className="price-header">
        <Link href="/" className="price-brand">
          吉田時計修理工房
        </Link>
        <nav className="price-nav" aria-label="ページナビゲーション">
          <Link href="/">トップへ戻る</Link>
          <a href={LINE_URL}>LINE相談</a>
        </nav>
      </header>

      <section className="price-hero">
        <p className="price-eyebrow">価格と修理品質</p>
        <h1>費用を抑えながらも、必要な工程を省略しない修理を心がけています。</h1>
        <p className="price-lead">
          メーカー修理は近年高額化しています。
          <br />
          当工房では、時計の状態を確認し、必要な工程を省略せずに行いながら、できる限り現実的な費用での修理をご提案します。
        </p>
        <div className="price-actions">
          <a href={LINE_URL} className="price-primary">
            LINEで相談する
          </a>
          <Link href="/" className="price-secondary">
            トップへ戻る
          </Link>
        </div>
      </section>

      <section className="price-section price-panel">
        <div className="price-section-heading">
          <span>01</span>
          <h2>メーカー修理との違い</h2>
        </div>
        <p>
          メーカー修理では、部品交換範囲や修理基準が決まっているため、安心感がある一方で費用が高額になることがあります。
        </p>
        <p>
          当工房では、時計の状態を確認し、必要な修理内容を整理したうえで、費用と仕上がりのバランスを考えながら対応方法をご提案します。
        </p>
      </section>

      <section className="price-section">
        <div className="price-section-heading">
          <span>02</span>
          <h2>価格比較の目安</h2>
        </div>
        <p className="price-note">
          以下は修理内容や状態によって変動するため、あくまで目安です。
          正式な金額は、実物確認後のお見積りとなります。
        </p>
        <div className="price-table-wrap" aria-label="価格比較の目安">
          <table className="price-table">
            <thead>
              <tr>
                <th rowSpan={2}>メーカー</th>
                <th colSpan={2}>クォーツ</th>
                <th colSpan={2}>機械式</th>
                <th colSpan={2}>クロノグラフ</th>
                <th rowSpan={2}>特記事項</th>
              </tr>
              <tr>
                <th>メーカー修理目安</th>
                <th>当工房目安</th>
                <th>メーカー修理目安</th>
                <th>当工房目安</th>
                <th>メーカー修理目安</th>
                <th>当工房目安</th>
              </tr>
            </thead>
            <tbody>
              {priceRows.map((row) => (
                <tr key={row.brand}>
                  <th scope="row">{row.brand}</th>
                  <td>{row.quartzMaker}</td>
                  <td className="shop-price">{row.quartzShop}</td>
                  <td>{row.mechanicalMaker}</td>
                  <td className="shop-price">{row.mechanicalShop}</td>
                  <td>{row.chronoMaker}</td>
                  <td className="shop-price">{row.chronoShop}</td>
                  <td className="price-table-note">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="price-section price-panel">
        <div className="price-section-heading">
          <span>03</span>
          <h2>安いだけの修理にしないために</h2>
        </div>
        <p>
          費用を抑えることは大切ですが、必要な工程を省略してしまうと、修理後の不具合につながる場合があります。
        </p>
        <p>
          当工房では、分解・洗浄・注油・調整・確認など、時計の状態に応じて必要な工程を判断しながら作業します。
        </p>
      </section>

      <section className="price-section price-panel">
        <div className="price-section-heading">
          <span>04</span>
          <h2>概算と正式見積り</h2>
        </div>
        <p>
          LINE相談では、写真・型番・症状をもとに受付前の概算をご案内します。
          正式な金額は、実物を確認したうえでお見積りします。
        </p>
        <p>
          概算と正式見積りの差が大きくならないよう、受付前にできる限り現実に近い費用感をお伝えするよう心がけています。
        </p>
      </section>

      <section className="price-final">
        <h2>まずは写真を送ってご相談ください</h2>
        <p>
          時計の写真・型番・症状をお送りいただければ、修理内容と費用感の目安をご案内します。
        </p>
        <a href={LINE_URL} className="price-primary">
          LINEで相談する
        </a>
      </section>

      <footer className="price-footer">
        <Link href="/">トップへ戻る</Link>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .price-quality-page {
          min-height: 100vh;
          background: #ffffff;
          color: #1a2b4b;
          font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
        }

        .price-header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .price-brand {
          color: #1a2b4b;
          font-size: 1.18rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-decoration: none;
        }

        .price-nav {
          display: flex;
          align-items: center;
          gap: 18px;
          font-size: 0.92rem;
          font-weight: 700;
        }

        .price-nav a,
        .price-footer a {
          color: #1a2b4b;
          text-decoration: none;
        }

        .price-nav a:last-child {
          padding: 10px 18px;
          border: 1px solid #c8d4e1;
          border-radius: 4px;
        }

        .price-hero {
          max-width: 960px;
          margin: 0 auto;
          padding: 92px 24px 72px;
          text-align: center;
        }

        .price-eyebrow {
          margin: 0 0 18px;
          color: #20385d;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        .price-hero h1 {
          margin: 0;
          color: #101b2c;
          font-size: clamp(2.2rem, 5vw, 4rem);
          line-height: 1.22;
          letter-spacing: 0;
        }

        .price-lead {
          max-width: 780px;
          margin: 26px auto 0;
          color: #405166;
          font-size: 1rem;
          line-height: 2;
          font-weight: 500;
        }

        .price-actions {
          margin-top: 34px;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 14px;
        }

        .price-primary,
        .price-secondary {
          min-width: 190px;
          box-sizing: border-box;
          display: inline-block;
          padding: 15px 26px;
          border-radius: 4px;
          font-size: 0.98rem;
          font-weight: 700;
          text-align: center;
          text-decoration: none;
        }

        .price-primary {
          background: #1a2b4b;
          border: 1px solid #1a2b4b;
          color: #ffffff;
        }

        .price-secondary {
          background: #ffffff;
          border: 1px solid #b8c5d4;
          color: #1a2b4b;
        }

        .price-section {
          max-width: 960px;
          margin: 0 auto 26px;
          padding: 0 24px;
        }

        .price-section-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .price-section-heading span {
          width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #d6e0ea;
          border-radius: 50%;
          color: #20385d;
          font-size: 0.82rem;
          font-weight: 700;
          flex: 0 0 auto;
        }

        .price-section-heading h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.45rem, 3vw, 2rem);
          letter-spacing: 0.03em;
        }

        .price-panel {
          box-sizing: border-box;
          padding: 30px 34px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          box-shadow: 0 12px 28px rgba(26, 43, 75, 0.05);
        }

        .price-panel p,
        .price-note {
          margin: 0;
          color: #405166;
          line-height: 2;
          font-weight: 500;
        }

        .price-panel p + p {
          margin-top: 14px;
        }

        .price-note {
          margin-bottom: 18px;
        }

        .price-table-wrap {
          overflow-x: auto;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
        }

        .price-table {
          width: 100%;
          min-width: 920px;
          border-collapse: collapse;
          font-size: 0.9rem;
        }

        .price-table th,
        .price-table td {
          padding: 14px 12px;
          border: 1px solid #dce5ee;
          text-align: center;
          vertical-align: middle;
        }

        .price-table thead th {
          background: #f1f5f9;
          color: #1a2b4b;
          font-weight: 700;
        }

        .price-table tbody th {
          color: #1a2b4b;
          font-weight: 700;
          background: #ffffff;
        }

        .shop-price {
          background: #eff6ff;
          color: #1a2b4b;
          font-weight: 700;
        }

        .price-table-note {
          min-width: 150px;
          text-align: left;
          color: #405166;
          font-size: 0.84rem;
        }

        .price-final {
          max-width: 960px;
          margin: 72px auto 0;
          box-sizing: border-box;
          padding: 46px 34px;
          border: 1px solid #d6e0ea;
          border-radius: 10px;
          background: #f8fafc;
          text-align: center;
        }

        .price-final h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.55rem, 3vw, 2.2rem);
        }

        .price-final p {
          max-width: 640px;
          margin: 18px auto 28px;
          color: #405166;
          line-height: 1.9;
          font-weight: 500;
        }

        .price-footer {
          max-width: 960px;
          margin: 0 auto;
          padding: 34px 24px 48px;
          text-align: center;
          font-size: 0.92rem;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .price-header {
            padding: 22px 20px;
            align-items: flex-start;
            flex-direction: column;
          }

          .price-nav {
            width: 100%;
            justify-content: space-between;
          }

          .price-hero {
            padding: 64px 20px 54px;
          }

          .price-lead {
            font-size: 0.96rem;
            line-height: 1.9;
          }

          .price-actions {
            flex-direction: column;
          }

          .price-primary,
          .price-secondary {
            width: 100%;
          }

          .price-section {
            padding: 0 20px;
          }

          .price-section-heading {
            align-items: flex-start;
          }

          .price-panel {
            padding: 26px 22px;
          }

          .price-final {
            margin: 58px 20px 0;
            padding: 36px 22px;
          }
        }
      `,
        }}
      />
    </main>
  );
}
