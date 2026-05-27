import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "技術者について | ヨシダ時計修理工房",
  description:
    "修理歴20年、1級時計修理技能士として、時計の状態を確認しながら必要な作業を判断しています。",
};

const LINE_URL = "https://lin.ee/3C0XfJW";

const careerItems = [
  "時計学校を卒業",
  "国内時計メーカーの修理現場を担当",
  "メーカー修理で培った点検・分解・調整の経験",
  "現在はヨシダ時計修理工房として、一般のお客様・業者様の修理に対応",
];

const repairPrinciples = [
  "状態に応じて必要な作業を見極めること",
  "状態に応じて現実的な修理方法を考えること",
  "部品交換だけで終わらせず、原因や周辺状態も確認すること",
  "お客様にとって納得しやすい説明を心がけること",
];

export default function AboutTechnicianPage() {
  return (
    <main className="technician-page">
      <header className="technician-header">
        <Link href="/" className="technician-brand">
          ヨシダ時計修理工房
        </Link>
        <nav className="technician-nav" aria-label="ページナビゲーション">
          <Link href="/">トップへ戻る</Link>
          <a href={LINE_URL}>LINE相談</a>
        </nav>
      </header>

      <section className="technician-hero">
        <p className="technician-eyebrow">技術者について</p>
        <h1>時計と向き合ってきた経験を、状態に応じた修理の判断に活かしています。</h1>
        <p className="technician-lead">
          時計学校卒業後、国内時計メーカーの修理現場で経験を積み、現在はヨシダ時計修理工房として修理を行っています。
          <br />
          修理歴20年、1級時計修理技能士として、状態を確認しながら一つひとつ必要な作業を判断しています。
        </p>
        <div className="technician-actions">
          <a href={LINE_URL} className="technician-primary">
            LINEで相談する
          </a>
          <Link href="/" className="technician-secondary">
            トップへ戻る
          </Link>
        </div>
      </section>

      <section className="technician-section">
        <div className="technician-section-heading">
          <span>01</span>
          <h2>これまでの歩み</h2>
        </div>
        <div className="technician-list-grid">
          {careerItems.map((item) => (
            <div key={item} className="technician-list-card">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="technician-section">
        <div className="technician-section-heading">
          <span>02</span>
          <h2>修理で大切にしていること</h2>
        </div>
        <div className="technician-list-grid">
          {repairPrinciples.map((item) => (
            <div key={item} className="technician-list-card">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="technician-section technician-panel">
        <div className="technician-section-heading">
          <span>03</span>
          <h2>相談しやすい修理工房であること</h2>
        </div>
        <p>
          修理の内容や金額は、時計の状態によって大きく変わります。
          そのため、できるだけ受付前に時計の写真や分かる範囲の情報を確認し、現実に近い概算をご案内しています。
        </p>
        <p>「まず聞いてみる」だけでも大丈夫です。</p>
      </section>

      <section className="technician-final">
        <h2>まずは写真を送ってご相談ください</h2>
        <p>
          時計の写真や分かる範囲の情報をお送りいただければ、受付前の概算相談が可能です。
        </p>
        <a href={LINE_URL} className="technician-primary">
          LINEで相談する
        </a>
      </section>

      <footer className="technician-footer">
        <Link href="/">トップへ戻る</Link>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .technician-page {
          min-height: 100vh;
          background: #ffffff;
          color: #1a2b4b;
          font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
        }

        .technician-header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .technician-brand {
          color: #1a2b4b;
          font-size: 1.18rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-decoration: none;
        }

        .technician-nav {
          display: flex;
          align-items: center;
          gap: 18px;
          font-size: 0.92rem;
          font-weight: 700;
        }

        .technician-nav a,
        .technician-footer a {
          color: #1a2b4b;
          text-decoration: none;
        }

        .technician-nav a:last-child {
          padding: 10px 18px;
          border: 1px solid #c8d4e1;
          border-radius: 4px;
        }

        .technician-hero {
          max-width: 960px;
          margin: 0 auto;
          padding: 92px 24px 72px;
          text-align: center;
        }

        .technician-eyebrow {
          margin: 0 0 18px;
          color: #20385d;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        .technician-hero h1 {
          margin: 0;
          color: #101b2c;
          font-size: clamp(2.2rem, 5vw, 4rem);
          line-height: 1.22;
          letter-spacing: 0;
        }

        .technician-lead {
          max-width: 780px;
          margin: 26px auto 0;
          color: #405166;
          font-size: 1rem;
          line-height: 2;
          font-weight: 500;
        }

        .technician-actions {
          margin-top: 34px;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 14px;
        }

        .technician-primary,
        .technician-secondary {
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

        .technician-primary {
          background: #1a2b4b;
          border: 1px solid #1a2b4b;
          color: #ffffff;
        }

        .technician-secondary {
          background: #ffffff;
          border: 1px solid #b8c5d4;
          color: #1a2b4b;
        }

        .technician-section {
          max-width: 960px;
          margin: 0 auto 26px;
          padding: 0 24px;
        }

        .technician-section-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .technician-section-heading span {
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

        .technician-section-heading h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.45rem, 3vw, 2rem);
          letter-spacing: 0.03em;
        }

        .technician-list-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .technician-list-card {
          padding: 18px 20px;
          border: 1px solid #dce5ee;
          border-radius: 8px;
          background: #ffffff;
          color: #405166;
          font-weight: 700;
          line-height: 1.7;
          box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
        }

        .technician-panel {
          box-sizing: border-box;
          padding: 30px 34px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          box-shadow: 0 12px 28px rgba(26, 43, 75, 0.05);
        }

        .technician-panel p {
          margin: 0;
          color: #405166;
          line-height: 2;
          font-weight: 500;
        }

        .technician-panel p + p {
          margin-top: 14px;
        }

        .technician-final {
          max-width: 960px;
          margin: 72px auto 0;
          box-sizing: border-box;
          padding: 46px 34px;
          border: 1px solid #d6e0ea;
          border-radius: 10px;
          background: #f8fafc;
          text-align: center;
        }

        .technician-final h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.55rem, 3vw, 2.2rem);
        }

        .technician-final p {
          max-width: 640px;
          margin: 18px auto 28px;
          color: #405166;
          line-height: 1.9;
          font-weight: 500;
        }

        .technician-footer {
          max-width: 960px;
          margin: 0 auto;
          padding: 34px 24px 48px;
          text-align: center;
          font-size: 0.92rem;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .technician-header {
            padding: 22px 20px;
            align-items: flex-start;
            flex-direction: column;
          }

          .technician-nav {
            width: 100%;
            justify-content: space-between;
          }

          .technician-hero {
            padding: 64px 20px 54px;
          }

          .technician-lead {
            font-size: 0.96rem;
            line-height: 1.9;
          }

          .technician-actions {
            flex-direction: column;
          }

          .technician-primary,
          .technician-secondary {
            width: 100%;
          }

          .technician-section {
            padding: 0 20px;
          }

          .technician-section-heading {
            align-items: flex-start;
          }

          .technician-list-grid {
            grid-template-columns: 1fr;
          }

          .technician-panel {
            padding: 26px 22px;
          }

          .technician-final {
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
