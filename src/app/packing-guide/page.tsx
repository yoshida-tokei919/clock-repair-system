import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "時計郵送時の梱包方法 | ヨシダ時計修理工房",
  description:
    "時計を郵送でお送りいただく際の梱包方法と、送料についてご案内します。",
};

const LINE_URL = "https://lin.ee/3C0XfJW";

export default function PackingGuidePage() {
  return (
    <main className="packing-guide-page">
      <header className="packing-header">
        <Link href="/" className="packing-brand">
          ヨシダ時計修理工房
        </Link>
        <nav className="packing-nav" aria-label="ページナビゲーション">
          <Link href="/">トップへ戻る</Link>
          <a href={LINE_URL}>LINE相談</a>
        </nav>
      </header>

      <section className="packing-hero">
        <p className="packing-eyebrow">時計郵送時の梱包方法</p>
        <h1>お手元の箱や緩衝材を使って、安全にお送りいただく方法です。</h1>
        <p className="packing-lead">
          時計をお送りいただく際は、箱の中で時計が動かないように保護してください。
          <br />
          金属ベルトの時計は、裏蓋とベルトが擦れないよう、腕を通す部分にも緩衝材を入れてから包むと安心です。
        </p>
      </section>

      <section className="packing-image-section" aria-label="時計郵送時の梱包方法">
        <img
          src="/img/watch-shipping-packaging-guide.png"
          alt="時計郵送時の梱包方法"
          className="packing-image"
        />
      </section>

      <section className="packing-section packing-panel">
        <h2>梱包時の補足</h2>
        <p>
          梱包で大切なのは、時計が箱の中で動かない状態にすることです。
          チャック付き袋に入れることで、雨濡れや、万一外れた部品の紛失対策にもなります。
          発送時は「壊れもの」指定をお願いします。シールは営業所への持ち込みや集荷時に配送会社で対応してもらえます。
        </p>
      </section>

      <section className="packing-section packing-panel">
        <h2>送料について</h2>
        <p>
          当工房へお送りいただく際の送料はお客様にご負担をお願いしております。
          修理完了後の返送料は、当工房にて負担いたします。
        </p>
      </section>

      <section className="packing-final">
        <h2>梱包方法が不安な場合はご相談ください</h2>
        <p>
          発送前に梱包方法が不安な場合は、LINEで写真をお送りいただければ確認いたします。
        </p>
        <div className="packing-actions">
          <a href={LINE_URL} className="packing-primary">
            LINEで相談する
          </a>
          <Link href="/repair-flow" className="packing-secondary">
            詳しい流れとポイントに戻る
          </Link>
        </div>
      </section>

      <footer className="packing-footer">
        <Link href="/repair-flow">詳しい流れとポイントに戻る</Link>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .packing-guide-page {
          min-height: 100vh;
          background: #ffffff;
          color: #1a2b4b;
          font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
        }

        .packing-header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .packing-brand {
          color: #1a2b4b;
          font-size: 1.18rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-decoration: none;
        }

        .packing-nav {
          display: flex;
          align-items: center;
          gap: 18px;
          font-size: 0.92rem;
          font-weight: 700;
        }

        .packing-nav a,
        .packing-footer a {
          color: #1a2b4b;
          text-decoration: none;
        }

        .packing-nav a:last-child {
          padding: 10px 18px;
          border: 1px solid #c8d4e1;
          border-radius: 4px;
        }

        .packing-hero {
          max-width: 960px;
          margin: 0 auto;
          padding: 86px 24px 46px;
          text-align: center;
        }

        .packing-eyebrow {
          margin: 0 0 18px;
          color: #20385d;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        .packing-hero h1 {
          margin: 0;
          color: #101b2c;
          font-size: clamp(2rem, 4.8vw, 3.5rem);
          line-height: 1.25;
          letter-spacing: 0;
        }

        .packing-lead {
          max-width: 780px;
          margin: 26px auto 0;
          color: #405166;
          font-size: 1rem;
          line-height: 2;
          font-weight: 500;
        }

        .packing-image-section {
          max-width: 960px;
          margin: 0 auto 34px;
          padding: 0 24px;
          box-sizing: border-box;
          text-align: center;
        }

        .packing-image {
          display: block;
          width: 100%;
          max-width: 860px;
          height: auto;
          margin: 0 auto;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          box-shadow: 0 12px 30px rgba(26, 43, 75, 0.08);
          background: #ffffff;
        }

        .packing-section {
          max-width: 860px;
          margin: 0 auto 18px;
          padding: 0 24px;
          box-sizing: border-box;
        }

        .packing-panel {
          padding: 28px 30px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
        }

        .packing-panel h2 {
          margin: 0 0 14px;
          color: #1a2b4b;
          font-size: clamp(1.3rem, 2.5vw, 1.75rem);
          letter-spacing: 0.03em;
        }

        .packing-panel p,
        .packing-final p {
          margin: 0;
          color: #405166;
          line-height: 2;
          font-weight: 500;
        }

        .packing-final {
          max-width: 860px;
          margin: 72px auto 0;
          box-sizing: border-box;
          padding: 46px 34px;
          border: 1px solid #d6e0ea;
          border-radius: 10px;
          background: #f8fafc;
          text-align: center;
        }

        .packing-final h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.55rem, 3vw, 2.2rem);
        }

        .packing-final p {
          max-width: 640px;
          margin: 18px auto 28px;
        }

        .packing-actions {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 14px;
        }

        .packing-primary,
        .packing-secondary {
          min-width: 220px;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 15px 26px;
          border-radius: 4px;
          font-size: 0.98rem;
          font-weight: 700;
          text-align: center;
          text-decoration: none;
        }

        .packing-primary {
          background: #1a2b4b;
          border: 1px solid #1a2b4b;
          color: #ffffff;
        }

        .packing-secondary {
          background: #ffffff;
          border: 1px solid #b8c5d4;
          color: #1a2b4b;
        }

        .packing-footer {
          max-width: 860px;
          margin: 0 auto;
          padding: 34px 24px 48px;
          text-align: center;
          font-size: 0.92rem;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .packing-header {
            padding: 22px 20px;
            align-items: flex-start;
            flex-direction: column;
          }

          .packing-nav {
            width: 100%;
            justify-content: space-between;
          }

          .packing-hero {
            padding: 60px 20px 38px;
          }

          .packing-lead {
            font-size: 0.96rem;
            line-height: 1.9;
          }

          .packing-image-section,
          .packing-section {
            padding: 0 20px;
          }

          .packing-panel {
            padding: 24px 22px;
          }

          .packing-final {
            margin: 58px 20px 0;
            padding: 36px 22px;
          }

          .packing-actions {
            flex-direction: column;
          }

          .packing-primary,
          .packing-secondary {
            width: 100%;
          }
        }
      `,
        }}
      />
    </main>
  );
}
