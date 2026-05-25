import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "LINEで概算相談 | 吉田時計修理工房",
  description:
    "時計を送る前に、写真・型番・症状から修理内容と費用感の目安をご案内します。",
};

const LINE_URL = "https://lin.ee/3C0XfJW";

const consultationPoints = [
  "修理できそうかどうかの見立て",
  "必要になりそうな修理内容",
  "費用感の目安",
  "部品交換が必要そうか",
  "受付前に確認しておきたい注意点",
];

const photoRequests = [
  "時計全体の正面写真",
  "裏蓋の写真",
  "リューズ、プッシャー、ガラスまわりの写真",
  "型番や刻印が分かる写真",
  "不具合箇所が分かる写真",
];

export default function LineConsultationPage() {
  return (
    <main className="line-consultation-page">
      <header className="consultation-header">
        <Link href="/" className="consultation-brand">
          吉田時計修理工房
        </Link>
        <nav className="consultation-nav" aria-label="ページナビゲーション">
          <Link href="/">トップへ戻る</Link>
          <a href={LINE_URL}>LINE相談</a>
        </nav>
      </header>

      <section className="consultation-hero">
        <p className="consultation-eyebrow">LINEで概算相談</p>
        <h1>時計を送る前に、修理内容と費用感の目安をご案内します。</h1>
        <p className="consultation-lead">
          写真・型番・症状をLINEで確認しながら、受付前にできる限り現実に近い概算をご案内します。
          <br />
          ご相談だけで修理受付にはなりません。
        </p>
        <div className="consultation-actions">
          <a href={LINE_URL} className="consultation-primary">
            LINEで相談する
          </a>
          <Link href="/" className="consultation-secondary">
            トップへ戻る
          </Link>
        </div>
      </section>

      <section className="consultation-section">
        <div className="consultation-section-heading">
          <span>01</span>
          <h2>LINE相談で分かること</h2>
        </div>
        <div className="consultation-list-grid">
          {consultationPoints.map((point) => (
            <div key={point} className="consultation-list-card">
              {point}
            </div>
          ))}
        </div>
      </section>

      <section className="consultation-section">
        <div className="consultation-section-heading">
          <span>02</span>
          <h2>送っていただきたい写真</h2>
        </div>
        <div className="consultation-list-grid">
          {photoRequests.map((photo) => (
            <div key={photo} className="consultation-list-card">
              {photo}
            </div>
          ))}
        </div>
        <p className="consultation-note">
          分かる範囲で大丈夫です。写真が多いほど、受付前の概算精度が上がります。
        </p>
      </section>

      <section className="consultation-section consultation-panel">
        <div className="consultation-section-heading">
          <span>03</span>
          <h2>概算と正式見積りの違い</h2>
        </div>
        <p>
          LINEでの概算は、写真と症状から受付前にご案内する目安です。
          正式な金額は、実物を確認したうえでお見積りします。
        </p>
        <p>
          内部状態や部品の状態によって、正式見積りが変わる場合があります。
        </p>
      </section>

      <section className="consultation-section consultation-panel">
        <div className="consultation-section-heading">
          <span>04</span>
          <h2>概算範囲内だった場合のお願い</h2>
        </div>
        <p>
          概算は、受付前にできる限り現実に近い金額をご案内するためのものです。
          正式見積りが概算の範囲内、または概算以下の場合は、できる限りそのまま修理進行をご検討いただけますと幸いです。
        </p>
      </section>

      <section className="consultation-final">
        <h2>まずは写真を送ってご相談ください</h2>
        <p>
          時計の写真・型番・症状をお送りいただければ、受付前の概算相談が可能です。
        </p>
        <a href={LINE_URL} className="consultation-primary">
          LINEで相談する
        </a>
      </section>

      <footer className="consultation-footer">
        <Link href="/">トップへ戻る</Link>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .line-consultation-page {
          min-height: 100vh;
          background: #ffffff;
          color: #1a2b4b;
          font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
        }

        .consultation-header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .consultation-brand {
          color: #1a2b4b;
          font-size: 1.18rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-decoration: none;
        }

        .consultation-nav {
          display: flex;
          align-items: center;
          gap: 18px;
          font-size: 0.92rem;
          font-weight: 700;
        }

        .consultation-nav a,
        .consultation-footer a {
          color: #1a2b4b;
          text-decoration: none;
        }

        .consultation-nav a:last-child {
          padding: 10px 18px;
          border: 1px solid #c8d4e1;
          border-radius: 4px;
        }

        .consultation-hero {
          max-width: 960px;
          margin: 0 auto;
          padding: 92px 24px 72px;
          text-align: center;
        }

        .consultation-eyebrow {
          margin: 0 0 18px;
          color: #20385d;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        .consultation-hero h1 {
          margin: 0;
          color: #101b2c;
          font-size: clamp(2.2rem, 5vw, 4rem);
          line-height: 1.22;
          letter-spacing: 0;
        }

        .consultation-lead {
          max-width: 760px;
          margin: 26px auto 0;
          color: #405166;
          font-size: 1rem;
          line-height: 2;
          font-weight: 500;
        }

        .consultation-actions {
          margin-top: 34px;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 14px;
        }

        .consultation-primary,
        .consultation-secondary {
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

        .consultation-primary {
          background: #1a2b4b;
          border: 1px solid #1a2b4b;
          color: #ffffff;
        }

        .consultation-secondary {
          background: #ffffff;
          border: 1px solid #b8c5d4;
          color: #1a2b4b;
        }

        .consultation-section {
          max-width: 960px;
          margin: 0 auto 26px;
          padding: 0 24px;
        }

        .consultation-section-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .consultation-section-heading span {
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

        .consultation-section-heading h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.45rem, 3vw, 2rem);
          letter-spacing: 0.03em;
        }

        .consultation-list-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .consultation-list-card {
          padding: 18px 20px;
          border: 1px solid #dce5ee;
          border-radius: 8px;
          background: #ffffff;
          color: #405166;
          font-weight: 700;
          line-height: 1.7;
          box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
        }

        .consultation-note {
          margin: 18px 0 0;
          color: #405166;
          line-height: 1.9;
        }

        .consultation-panel {
          box-sizing: border-box;
          padding: 30px 34px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          box-shadow: 0 12px 28px rgba(26, 43, 75, 0.05);
        }

        .consultation-panel p {
          margin: 0;
          color: #405166;
          line-height: 2;
          font-weight: 500;
        }

        .consultation-panel p + p {
          margin-top: 14px;
        }

        .consultation-final {
          max-width: 960px;
          margin: 72px auto 0;
          box-sizing: border-box;
          padding: 46px 34px;
          border: 1px solid #d6e0ea;
          border-radius: 10px;
          background: #f8fafc;
          text-align: center;
        }

        .consultation-final h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.55rem, 3vw, 2.2rem);
        }

        .consultation-final p {
          max-width: 640px;
          margin: 18px auto 28px;
          color: #405166;
          line-height: 1.9;
          font-weight: 500;
        }

        .consultation-footer {
          max-width: 960px;
          margin: 0 auto;
          padding: 34px 24px 48px;
          text-align: center;
          font-size: 0.92rem;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .consultation-header {
            padding: 22px 20px;
            align-items: flex-start;
            flex-direction: column;
          }

          .consultation-nav {
            width: 100%;
            justify-content: space-between;
          }

          .consultation-hero {
            padding: 64px 20px 54px;
          }

          .consultation-lead {
            font-size: 0.96rem;
            line-height: 1.9;
          }

          .consultation-actions {
            flex-direction: column;
          }

          .consultation-primary,
          .consultation-secondary {
            width: 100%;
          }

          .consultation-section {
            padding: 0 20px;
          }

          .consultation-section-heading {
            align-items: flex-start;
          }

          .consultation-list-grid {
            grid-template-columns: 1fr;
          }

          .consultation-panel {
            padding: 26px 22px;
          }

          .consultation-final {
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
