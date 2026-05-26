import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "防水確認 | 吉田時計修理工房",
  description:
    "オーバーホール後の防水検査やパッキン確認について、時計の状態に合わせた確認内容をご案内します。",
};

const LINE_URL = "https://lin.ee/3C0XfJW";

const checkItems = [
  "裏蓋パッキン",
  "リューズパッキン",
  "プッシャーパッキン",
  "ガラスまわり",
  "ケースや裏蓋の状態",
  "防水検査結果",
];

export default function WaterproofCheckPage() {
  return (
    <main className="waterproof-page">
      <header className="waterproof-header">
        <Link href="/" className="waterproof-brand">
          吉田時計修理工房
        </Link>
        <nav className="waterproof-nav" aria-label="ページナビゲーション">
          <Link href="/">トップへ戻る</Link>
          <a href={LINE_URL}>LINE相談</a>
        </nav>
      </header>

      <section className="waterproof-hero">
        <p className="waterproof-eyebrow">防水確認</p>
        <h1>パッキンの状態まで確認し、防水性能をできる限り整えます。</h1>
        <p className="waterproof-lead">
          オーバーホール後は防水検査を行い、裏蓋・リューズ・プッシャー・ガラスまわりのパッキンまで確認します。
          <br />
          多数のパッキンを取り揃え、時計の状態に合わせて防水性をできる限り整えます。
        </p>
        <div className="waterproof-actions">
          <a href={LINE_URL} className="waterproof-primary">
            LINEで相談する
          </a>
          <Link href="/" className="waterproof-secondary">
            トップへ戻る
          </Link>
        </div>
      </section>

      <section className="waterproof-section">
        <div className="waterproof-section-heading">
          <span>01</span>
          <h2>防水確認で見ているところ</h2>
        </div>
        <div className="waterproof-list-grid">
          {checkItems.map((item) => (
            <div key={item} className="waterproof-list-card">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="waterproof-section waterproof-panel">
        <div className="waterproof-section-heading">
          <span>02</span>
          <h2>多数のパッキンを取り揃えています</h2>
        </div>
        <p>
          防水性を整えるには、時計に合ったパッキンを選ぶことが重要です。
          当工房では多くの種類のパッキンを取り揃え、できる限り時計に合うものを確認します。
        </p>
        <p>
          時計の構造や劣化状態によっては、防水性を十分に確保できない場合もあります。
          その場合も、状態を確認したうえでご説明します。
        </p>
      </section>

      <section className="waterproof-section waterproof-panel">
        <div className="waterproof-section-heading">
          <span>03</span>
          <h2>防水検査について</h2>
        </div>
        <p>
          オーバーホール後は防水検査を行い、使用環境に合わせて状態を確認します。
          検査結果や時計の構造によって、日常使用で注意していただきたい点をご案内する場合があります。
        </p>
      </section>

      <section className="waterproof-section waterproof-panel">
        <div className="waterproof-section-heading">
          <span>04</span>
          <h2>防水保証ではなく、状態確認として</h2>
        </div>
        <p>
          防水検査は、現在の時計の状態を確認するためのものです。
          古い時計やケースに劣化がある時計では、完全な防水性能を保証できない場合があります。
        </p>
        <p>
          できる限り防水性を整えたうえで、注意点があれば事前にご説明します。
        </p>
      </section>

      <section className="waterproof-final">
        <h2>まずは写真を送ってご相談ください</h2>
        <p>
          時計の写真・型番・症状をお送りいただければ、防水確認やパッキン交換が必要そうかも含めてご案内します。
        </p>
        <a href={LINE_URL} className="waterproof-primary">
          LINEで相談する
        </a>
      </section>

      <footer className="waterproof-footer">
        <Link href="/">トップへ戻る</Link>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .waterproof-page {
          min-height: 100vh;
          background: #ffffff;
          color: #1a2b4b;
          font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
        }

        .waterproof-header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .waterproof-brand {
          color: #1a2b4b;
          font-size: 1.18rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-decoration: none;
        }

        .waterproof-nav {
          display: flex;
          align-items: center;
          gap: 18px;
          font-size: 0.92rem;
          font-weight: 700;
        }

        .waterproof-nav a,
        .waterproof-footer a {
          color: #1a2b4b;
          text-decoration: none;
        }

        .waterproof-nav a:last-child {
          padding: 10px 18px;
          border: 1px solid #c8d4e1;
          border-radius: 4px;
        }

        .waterproof-hero {
          max-width: 960px;
          margin: 0 auto;
          padding: 92px 24px 72px;
          text-align: center;
        }

        .waterproof-eyebrow {
          margin: 0 0 18px;
          color: #20385d;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        .waterproof-hero h1 {
          margin: 0;
          color: #101b2c;
          font-size: clamp(2.2rem, 5vw, 4rem);
          line-height: 1.22;
          letter-spacing: 0;
        }

        .waterproof-lead {
          max-width: 780px;
          margin: 26px auto 0;
          color: #405166;
          font-size: 1rem;
          line-height: 2;
          font-weight: 500;
        }

        .waterproof-actions {
          margin-top: 34px;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 14px;
        }

        .waterproof-primary,
        .waterproof-secondary {
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

        .waterproof-primary {
          background: #1a2b4b;
          border: 1px solid #1a2b4b;
          color: #ffffff;
        }

        .waterproof-secondary {
          background: #ffffff;
          border: 1px solid #b8c5d4;
          color: #1a2b4b;
        }

        .waterproof-section {
          max-width: 960px;
          margin: 0 auto 26px;
          padding: 0 24px;
        }

        .waterproof-section-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .waterproof-section-heading span {
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

        .waterproof-section-heading h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.45rem, 3vw, 2rem);
          letter-spacing: 0.03em;
        }

        .waterproof-list-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .waterproof-list-card {
          padding: 18px 20px;
          border: 1px solid #dce5ee;
          border-radius: 8px;
          background: #ffffff;
          color: #405166;
          font-weight: 700;
          line-height: 1.7;
          box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
        }

        .waterproof-panel {
          box-sizing: border-box;
          padding: 30px 34px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          box-shadow: 0 12px 28px rgba(26, 43, 75, 0.05);
        }

        .waterproof-panel p {
          margin: 0;
          color: #405166;
          line-height: 2;
          font-weight: 500;
        }

        .waterproof-panel p + p {
          margin-top: 14px;
        }

        .waterproof-final {
          max-width: 960px;
          margin: 72px auto 0;
          box-sizing: border-box;
          padding: 46px 34px;
          border: 1px solid #d6e0ea;
          border-radius: 10px;
          background: #f8fafc;
          text-align: center;
        }

        .waterproof-final h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.55rem, 3vw, 2.2rem);
        }

        .waterproof-final p {
          max-width: 640px;
          margin: 18px auto 28px;
          color: #405166;
          line-height: 1.9;
          font-weight: 500;
        }

        .waterproof-footer {
          max-width: 960px;
          margin: 0 auto;
          padding: 34px 24px 48px;
          text-align: center;
          font-size: 0.92rem;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .waterproof-header {
            padding: 22px 20px;
            align-items: flex-start;
            flex-direction: column;
          }

          .waterproof-nav {
            width: 100%;
            justify-content: space-between;
          }

          .waterproof-hero {
            padding: 64px 20px 54px;
          }

          .waterproof-lead {
            font-size: 0.96rem;
            line-height: 1.9;
          }

          .waterproof-actions {
            flex-direction: column;
          }

          .waterproof-primary,
          .waterproof-secondary {
            width: 100%;
          }

          .waterproof-section {
            padding: 0 20px;
          }

          .waterproof-section-heading {
            align-items: flex-start;
          }

          .waterproof-list-grid {
            grid-template-columns: 1fr;
          }

          .waterproof-panel {
            padding: 26px 22px;
          }

          .waterproof-final {
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
