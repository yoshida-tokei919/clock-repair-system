import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "安心してご相談いただくために | 吉田時計修理工房",
  description:
    "時計修理の相談前・受付前に不安になりやすい点を、受付、見積り、代替部品、保証の考え方に分けてご案内します。",
};

const LINE_URL = "https://lin.ee/3C0XfJW";

const reassuranceItems = [
  {
    title: "相談だけでは受付になりません",
    body:
      "LINEで写真・型番・症状を確認し、受付前にできる限り現実に近い概算をご案内します。ご相談いただいただけで、修理受付や作業開始になることはありません。",
  },
  {
    title: "正式な作業は、内容と金額の確認後に進めます",
    body:
      "実物確認後に、必要な作業内容や部品交換の有無を整理して正式見積りをご案内します。正式な作業は、内容と金額をご確認いただいてから進めます。",
  },
  {
    title: "追加作業や代替部品は事前にご説明します",
    body:
      "分解後に追加作業が必要になる場合や、純正部品ではなく適合部品・FITパーツ・加工対応を検討する場合があります。その場合は、できる限り事前に内容と理由をご説明します。",
  },
  {
    title: "FITパーツや代替部品について",
    body:
      "純正部品が入手できる場合は、まず純正部品での対応を検討します。一方で、純正部品が入手困難な場合は、品質の良い適合部品やFITパーツ、加工対応によって修理できる場合があります。",
    note:
      "代替部品を使用する場合は、メリットだけでなく注意点もご説明します。代替部品や加工対応を行った場合、将来的なメーカー修理受付に影響する可能性があります。気になる場合は、事前にご相談ください。",
  },
  {
    title: "保証について",
    body:
      "オーバーホールには1年保証をお付けしています。ただし、保証の対象範囲は修理内容や時計の状態によって異なります。",
    note:
      "落下・水入り・磁気帯び・外装破損・消耗部品・お客様の使用環境による不具合など、保証対象外となる場合があります。保証内容は、修理内容に応じて納品時にご案内します。",
  },
  {
    title: "概算範囲内だった場合のお願い",
    body:
      "概算は、受付前にできる限り現実に近い金額をご案内するためのものです。正式見積りが概算の範囲内、または概算以下の場合は、できる限りそのまま修理進行をご検討いただけますと幸いです。",
  },
];

export default function ReassurancePage() {
  return (
    <main className="reassurance-page">
      <header className="reassurance-header">
        <Link href="/" className="reassurance-brand">
          吉田時計修理工房
        </Link>
        <nav className="reassurance-nav" aria-label="ページナビゲーション">
          <Link href="/">トップへ戻る</Link>
          <a href={LINE_URL}>LINE相談</a>
        </nav>
      </header>

      <section className="reassurance-hero">
        <p className="reassurance-eyebrow">安心してご相談いただくために</p>
        <h1>修理前に不安になりやすい点を、事前に確認できます。</h1>
        <p className="reassurance-lead">
          時計修理は、実物を確認して初めて分かることも多くあります。
          <br />
          そのため当工房では、受付前の概算案内、正式見積り、追加作業や部品変更の事前説明を大切にしています。
        </p>
        <div className="reassurance-actions">
          <a href={LINE_URL} className="reassurance-primary">
            LINEで相談する
          </a>
          <Link href="/" className="reassurance-secondary">
            トップへ戻る
          </Link>
        </div>
      </section>

      <section className="reassurance-section">
        <div className="reassurance-list">
          {reassuranceItems.map((item, index) => (
            <article key={item.title} className="reassurance-card">
              <span className="reassurance-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                {item.note ? <p className="reassurance-note">{item.note}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="reassurance-final">
        <h2>まずは写真を送ってご相談ください</h2>
        <p>
          時計の写真・型番・症状をお送りいただければ、受付前の概算相談が可能です。
        </p>
        <a href={LINE_URL} className="reassurance-primary">
          LINEで相談する
        </a>
      </section>

      <footer className="reassurance-footer">
        <Link href="/">トップへ戻る</Link>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .reassurance-page {
          min-height: 100vh;
          background: #ffffff;
          color: #1a2b4b;
          font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
        }

        .reassurance-header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .reassurance-brand {
          color: #1a2b4b;
          font-size: 1.18rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-decoration: none;
        }

        .reassurance-nav {
          display: flex;
          align-items: center;
          gap: 18px;
          font-size: 0.92rem;
          font-weight: 700;
        }

        .reassurance-nav a,
        .reassurance-footer a {
          color: #1a2b4b;
          text-decoration: none;
        }

        .reassurance-nav a:last-child {
          padding: 10px 18px;
          border: 1px solid #c8d4e1;
          border-radius: 4px;
        }

        .reassurance-hero {
          max-width: 960px;
          margin: 0 auto;
          padding: 92px 24px 72px;
          text-align: center;
        }

        .reassurance-eyebrow {
          margin: 0 0 18px;
          color: #20385d;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        .reassurance-hero h1 {
          margin: 0;
          color: #101b2c;
          font-size: clamp(2.2rem, 5vw, 4rem);
          line-height: 1.22;
          letter-spacing: 0;
        }

        .reassurance-lead {
          max-width: 780px;
          margin: 26px auto 0;
          color: #405166;
          font-size: 1rem;
          line-height: 2;
          font-weight: 500;
        }

        .reassurance-actions {
          margin-top: 34px;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 14px;
        }

        .reassurance-primary,
        .reassurance-secondary {
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

        .reassurance-primary {
          background: #1a2b4b;
          border: 1px solid #1a2b4b;
          color: #ffffff;
        }

        .reassurance-secondary {
          background: #ffffff;
          border: 1px solid #b8c5d4;
          color: #1a2b4b;
        }

        .reassurance-section {
          max-width: 960px;
          margin: 0 auto;
          padding: 0 24px;
        }

        .reassurance-list {
          display: grid;
          gap: 16px;
        }

        .reassurance-card {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 18px;
          padding: 28px 30px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
        }

        .reassurance-number {
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
        }

        .reassurance-card h2 {
          margin: 0 0 14px;
          color: #1a2b4b;
          font-size: clamp(1.3rem, 2.5vw, 1.75rem);
          letter-spacing: 0.03em;
        }

        .reassurance-card p {
          margin: 0;
          color: #405166;
          line-height: 2;
          font-weight: 500;
        }

        .reassurance-note {
          margin-top: 14px !important;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          color: #53657b !important;
          font-size: 0.95rem;
        }

        .reassurance-final {
          max-width: 960px;
          margin: 72px auto 0;
          box-sizing: border-box;
          padding: 46px 34px;
          border: 1px solid #d6e0ea;
          border-radius: 10px;
          background: #f8fafc;
          text-align: center;
        }

        .reassurance-final h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.55rem, 3vw, 2.2rem);
        }

        .reassurance-final p {
          max-width: 640px;
          margin: 18px auto 28px;
          color: #405166;
          line-height: 1.9;
          font-weight: 500;
        }

        .reassurance-footer {
          max-width: 960px;
          margin: 0 auto;
          padding: 34px 24px 48px;
          text-align: center;
          font-size: 0.92rem;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .reassurance-header {
            padding: 22px 20px;
            align-items: flex-start;
            flex-direction: column;
          }

          .reassurance-nav {
            width: 100%;
            justify-content: space-between;
          }

          .reassurance-hero {
            padding: 64px 20px 54px;
          }

          .reassurance-lead {
            font-size: 0.96rem;
            line-height: 1.9;
          }

          .reassurance-actions {
            flex-direction: column;
          }

          .reassurance-primary,
          .reassurance-secondary {
            width: 100%;
          }

          .reassurance-section {
            padding: 0 20px;
          }

          .reassurance-card {
            grid-template-columns: 1fr;
            padding: 24px 22px;
          }

          .reassurance-final {
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
