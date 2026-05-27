import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "修理の可能性を探す | ヨシダ時計修理工房",
  description:
    "他店で断られた時計も、部品調達・製作・代替案を含めて修理の可能性をできる限り探ります。",
};

const LINE_URL = "https://lin.ee/3C0XfJW";

const repairOptions = [
  "国内外の材料店から部品を探す",
  "修理仲間のネットワークを活用する",
  "適合部品やFITパーツを検討する",
  "入手困難な部品は製作や加工を検討する",
  "純正部品が難しい場合は、代替案を説明する",
];

const consultationExamples = [
  "メーカーで部品供給終了と言われた時計",
  "他店で修理不可と言われた時計",
  "古い機械式時計",
  "リューズ、ガラス、パッキンなど外装部品が見つからない時計",
  "部品が破損していて通常交換が難しい時計",
  "思い入れがあり、できる限り残したい時計",
];

export default function DifficultRepairPage() {
  return (
    <main className="difficult-repair-page">
      <header className="repair-header">
        <Link href="/" className="repair-brand">
          ヨシダ時計修理工房
        </Link>
        <nav className="repair-nav" aria-label="ページナビゲーション">
          <Link href="/">トップへ戻る</Link>
          <a href={LINE_URL}>LINE相談</a>
        </nav>
      </header>

      <section className="repair-hero">
        <p className="repair-eyebrow">修理の可能性を探す</p>
        <h1>他店で断られた時計も、修理の可能性をできる限り探ります。</h1>
        <p className="repair-lead">
          部品供給終了、古い時計、特殊な外装部品、入手困難な部品など、一般的には修理が難しい時計でも、部品調達・製作・代替案を含めて対応方法を検討します。
        </p>
        <div className="repair-actions">
          <a href={LINE_URL} className="repair-primary">
            LINEで相談する
          </a>
          <Link href="/" className="repair-secondary">
            トップへ戻る
          </Link>
        </div>
      </section>

      <section className="repair-section repair-panel">
        <div className="repair-section-heading">
          <span>01</span>
          <h2>受付実績から見る修理対応</h2>
        </div>
        <p>
          過去約4,000件の受付実績では、当店判断で修理不可として返却したケースは約3%です。
        </p>
        <p>
          もちろん、すべての時計を修理できるとは限りません。
          状態・部品の入手状況・費用対効果を確認しながら、できる限り現実的な対応方法を探します。
        </p>
      </section>

      <section className="repair-section">
        <div className="repair-section-heading">
          <span>02</span>
          <h2>修理の選択肢を柔軟に検討します</h2>
        </div>
        <div className="repair-list-grid">
          {repairOptions.map((option) => (
            <div key={option} className="repair-list-card">
              {option}
            </div>
          ))}
        </div>
        <p className="repair-note">
          ご希望に合わせて柔軟に対応いたしますが、時計の状態や部品事情によって選択できる方法は変わります。
        </p>
      </section>

      <section className="repair-section">
        <div className="repair-section-heading">
          <span>03</span>
          <h2>こんな時計もご相談ください</h2>
        </div>
        <div className="repair-list-grid">
          {consultationExamples.map((example) => (
            <div key={example} className="repair-list-card">
              {example}
            </div>
          ))}
        </div>
      </section>

      <section className="repair-section repair-panel">
        <div className="repair-section-heading">
          <span>04</span>
          <h2>FITパーツや代替部品について</h2>
        </div>
        <p>
          純正部品が入手できる場合は、まず純正部品での対応を検討します。
          一方で、純正部品の入手が難しい場合でも、品質の良い適合部品やFITパーツ、加工対応によって修理できる場合があります。
        </p>
        <p>
          代替部品を使用する場合は、事前にメリット・注意点をご説明します。
        </p>
      </section>

      <section className="repair-final">
        <h2>まずは写真を送ってご相談ください</h2>
        <p>
          時計の写真や分かる範囲の情報をお送りいただければ、修理の可能性や概算の目安をご案内します。
        </p>
        <a href={LINE_URL} className="repair-primary">
          LINEで相談する
        </a>
      </section>

      <footer className="repair-footer">
        <Link href="/">トップへ戻る</Link>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .difficult-repair-page {
          min-height: 100vh;
          background: #ffffff;
          color: #1a2b4b;
          font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
        }

        .repair-header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .repair-brand {
          color: #1a2b4b;
          font-size: 1.18rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-decoration: none;
        }

        .repair-nav {
          display: flex;
          align-items: center;
          gap: 18px;
          font-size: 0.92rem;
          font-weight: 700;
        }

        .repair-nav a,
        .repair-footer a {
          color: #1a2b4b;
          text-decoration: none;
        }

        .repair-nav a:last-child {
          padding: 10px 18px;
          border: 1px solid #c8d4e1;
          border-radius: 4px;
        }

        .repair-hero {
          max-width: 960px;
          margin: 0 auto;
          padding: 92px 24px 72px;
          text-align: center;
        }

        .repair-eyebrow {
          margin: 0 0 18px;
          color: #20385d;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        .repair-hero h1 {
          margin: 0;
          color: #101b2c;
          font-size: clamp(2.2rem, 5vw, 4rem);
          line-height: 1.22;
          letter-spacing: 0;
        }

        .repair-lead {
          max-width: 780px;
          margin: 26px auto 0;
          color: #405166;
          font-size: 1rem;
          line-height: 2;
          font-weight: 500;
        }

        .repair-actions {
          margin-top: 34px;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 14px;
        }

        .repair-primary,
        .repair-secondary {
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

        .repair-primary {
          background: #1a2b4b;
          border: 1px solid #1a2b4b;
          color: #ffffff;
        }

        .repair-secondary {
          background: #ffffff;
          border: 1px solid #b8c5d4;
          color: #1a2b4b;
        }

        .repair-section {
          max-width: 960px;
          margin: 0 auto 26px;
          padding: 0 24px;
        }

        .repair-section-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .repair-section-heading span {
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

        .repair-section-heading h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.45rem, 3vw, 2rem);
          letter-spacing: 0.03em;
        }

        .repair-list-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .repair-list-card {
          padding: 18px 20px;
          border: 1px solid #dce5ee;
          border-radius: 8px;
          background: #ffffff;
          color: #405166;
          font-weight: 700;
          line-height: 1.7;
          box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
        }

        .repair-note {
          margin: 18px 0 0;
          color: #405166;
          line-height: 1.9;
        }

        .repair-panel {
          box-sizing: border-box;
          padding: 30px 34px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          box-shadow: 0 12px 28px rgba(26, 43, 75, 0.05);
        }

        .repair-panel p {
          margin: 0;
          color: #405166;
          line-height: 2;
          font-weight: 500;
        }

        .repair-panel p + p {
          margin-top: 14px;
        }

        .repair-final {
          max-width: 960px;
          margin: 72px auto 0;
          box-sizing: border-box;
          padding: 46px 34px;
          border: 1px solid #d6e0ea;
          border-radius: 10px;
          background: #f8fafc;
          text-align: center;
        }

        .repair-final h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.55rem, 3vw, 2.2rem);
        }

        .repair-final p {
          max-width: 640px;
          margin: 18px auto 28px;
          color: #405166;
          line-height: 1.9;
          font-weight: 500;
        }

        .repair-footer {
          max-width: 960px;
          margin: 0 auto;
          padding: 34px 24px 48px;
          text-align: center;
          font-size: 0.92rem;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .repair-header {
            padding: 22px 20px;
            align-items: flex-start;
            flex-direction: column;
          }

          .repair-nav {
            width: 100%;
            justify-content: space-between;
          }

          .repair-hero {
            padding: 64px 20px 54px;
          }

          .repair-lead {
            font-size: 0.96rem;
            line-height: 1.9;
          }

          .repair-actions {
            flex-direction: column;
          }

          .repair-primary,
          .repair-secondary {
            width: 100%;
          }

          .repair-section {
            padding: 0 20px;
          }

          .repair-section-heading {
            align-items: flex-start;
          }

          .repair-list-grid {
            grid-template-columns: 1fr;
          }

          .repair-panel {
            padding: 26px 22px;
          }

          .repair-final {
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
