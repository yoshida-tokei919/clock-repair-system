import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "部品調達 | 吉田時計修理工房",
  description:
    "入手困難な時計部品も、国内外の材料店や修理仲間のネットワークからできる限り探します。",
};

const LINE_URL = "https://lin.ee/3C0XfJW";

const partExamples = [
  "リューズ",
  "ガラス",
  "パッキン",
  "巻真",
  "ゼンマイ",
  "歯車",
  "外装部品",
  "ムーブメント内部部品",
];

export default function PartsSourcingPage() {
  return (
    <main className="parts-page">
      <header className="parts-header">
        <Link href="/" className="parts-brand">
          吉田時計修理工房
        </Link>
        <nav className="parts-nav" aria-label="ページナビゲーション">
          <Link href="/">トップへ戻る</Link>
          <a href={LINE_URL}>LINE相談</a>
        </nav>
      </header>

      <section className="parts-hero">
        <p className="parts-eyebrow">部品調達</p>
        <h1>入手困難な部品も、国内外の仕入れ先から探します。</h1>
        <p className="parts-lead">
          メーカーで部品供給終了と言われた時計や、他店で部品が見つからないと言われた時計でも、国内外の材料店や修理仲間のネットワークを活用して、できる限り部品を探します。
        </p>
        <div className="parts-actions">
          <a href={LINE_URL} className="parts-primary">
            LINEで相談する
          </a>
          <Link href="/" className="parts-secondary">
            トップへ戻る
          </Link>
        </div>
      </section>

      <section className="parts-section parts-panel">
        <div className="parts-section-heading">
          <span>01</span>
          <h2>部品が見つかる可能性を探します</h2>
        </div>
        <p>
          時計修理では、部品が入手できるかどうかで対応できる内容が大きく変わります。
          当工房では、国内外の材料店、修理仲間のネットワーク、過去の修理実績をもとに、通常では見つかりにくい部品もできる限り探します。
        </p>
      </section>

      <section className="parts-section">
        <div className="parts-section-heading">
          <span>02</span>
          <h2>探せる部品の例</h2>
        </div>
        <div className="parts-list-grid">
          {partExamples.map((part) => (
            <div key={part} className="parts-list-card">
              {part}
            </div>
          ))}
        </div>
        <p className="parts-note">
          時計のブランド・型番・年代・状態によって、探せる部品や対応方法は変わります。
        </p>
      </section>

      <section className="parts-section parts-panel">
        <div className="parts-section-heading">
          <span>03</span>
          <h2>純正部品・適合部品・FITパーツについて</h2>
        </div>
        <p>
          純正部品が入手できる場合は、まず純正部品での対応を検討します。
          一方で、純正部品が入手困難な場合は、適合部品やFITパーツを使うことで修理できる場合があります。
        </p>
        <p>使用する部品の種類や注意点は、事前にご説明します。</p>
      </section>

      <section className="parts-section parts-panel">
        <div className="parts-section-heading">
          <span>04</span>
          <h2>部品が見つからない場合</h2>
        </div>
        <p>
          部品が見つからない場合でも、すぐに修理不可と判断するのではなく、加工・製作・代替案を含めて対応方法を検討します。
          ただし、時計の状態や費用対効果によっては、修理をおすすめしない場合もあります。
        </p>
      </section>

      <section className="parts-final">
        <h2>まずは写真を送ってご相談ください</h2>
        <p>
          時計の写真・型番・症状をお送りいただければ、部品調達の可能性や概算の目安をご案内します。
        </p>
        <a href={LINE_URL} className="parts-primary">
          LINEで相談する
        </a>
      </section>

      <footer className="parts-footer">
        <Link href="/">トップへ戻る</Link>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .parts-page {
          min-height: 100vh;
          background: #ffffff;
          color: #1a2b4b;
          font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
        }

        .parts-header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .parts-brand {
          color: #1a2b4b;
          font-size: 1.18rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-decoration: none;
        }

        .parts-nav {
          display: flex;
          align-items: center;
          gap: 18px;
          font-size: 0.92rem;
          font-weight: 700;
        }

        .parts-nav a,
        .parts-footer a {
          color: #1a2b4b;
          text-decoration: none;
        }

        .parts-nav a:last-child {
          padding: 10px 18px;
          border: 1px solid #c8d4e1;
          border-radius: 4px;
        }

        .parts-hero {
          max-width: 960px;
          margin: 0 auto;
          padding: 92px 24px 72px;
          text-align: center;
        }

        .parts-eyebrow {
          margin: 0 0 18px;
          color: #20385d;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        .parts-hero h1 {
          margin: 0;
          color: #101b2c;
          font-size: clamp(2.2rem, 5vw, 4rem);
          line-height: 1.22;
          letter-spacing: 0;
        }

        .parts-lead {
          max-width: 780px;
          margin: 26px auto 0;
          color: #405166;
          font-size: 1rem;
          line-height: 2;
          font-weight: 500;
        }

        .parts-actions {
          margin-top: 34px;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 14px;
        }

        .parts-primary,
        .parts-secondary {
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

        .parts-primary {
          background: #1a2b4b;
          border: 1px solid #1a2b4b;
          color: #ffffff;
        }

        .parts-secondary {
          background: #ffffff;
          border: 1px solid #b8c5d4;
          color: #1a2b4b;
        }

        .parts-section {
          max-width: 960px;
          margin: 0 auto 26px;
          padding: 0 24px;
        }

        .parts-section-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .parts-section-heading span {
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

        .parts-section-heading h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.45rem, 3vw, 2rem);
          letter-spacing: 0.03em;
        }

        .parts-list-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .parts-list-card {
          padding: 18px 20px;
          border: 1px solid #dce5ee;
          border-radius: 8px;
          background: #ffffff;
          color: #405166;
          font-weight: 700;
          line-height: 1.7;
          box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
        }

        .parts-note {
          margin: 18px 0 0;
          color: #405166;
          line-height: 1.9;
        }

        .parts-panel {
          box-sizing: border-box;
          padding: 30px 34px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          box-shadow: 0 12px 28px rgba(26, 43, 75, 0.05);
        }

        .parts-panel p {
          margin: 0;
          color: #405166;
          line-height: 2;
          font-weight: 500;
        }

        .parts-panel p + p {
          margin-top: 14px;
        }

        .parts-final {
          max-width: 960px;
          margin: 72px auto 0;
          box-sizing: border-box;
          padding: 46px 34px;
          border: 1px solid #d6e0ea;
          border-radius: 10px;
          background: #f8fafc;
          text-align: center;
        }

        .parts-final h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.55rem, 3vw, 2.2rem);
        }

        .parts-final p {
          max-width: 640px;
          margin: 18px auto 28px;
          color: #405166;
          line-height: 1.9;
          font-weight: 500;
        }

        .parts-footer {
          max-width: 960px;
          margin: 0 auto;
          padding: 34px 24px 48px;
          text-align: center;
          font-size: 0.92rem;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .parts-header {
            padding: 22px 20px;
            align-items: flex-start;
            flex-direction: column;
          }

          .parts-nav {
            width: 100%;
            justify-content: space-between;
          }

          .parts-hero {
            padding: 64px 20px 54px;
          }

          .parts-lead {
            font-size: 0.96rem;
            line-height: 1.9;
          }

          .parts-actions {
            flex-direction: column;
          }

          .parts-primary,
          .parts-secondary {
            width: 100%;
          }

          .parts-section {
            padding: 0 20px;
          }

          .parts-section-heading {
            align-items: flex-start;
          }

          .parts-list-grid {
            grid-template-columns: 1fr;
          }

          .parts-panel {
            padding: 26px 22px;
          }

          .parts-final {
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
