import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "修理の流れ | 吉田時計修理工房",
  description:
    "LINE相談から正式見積り、修理、納品まで、時計修理の基本的な流れをご案内します。",
};

const LINE_URL = "https://lin.ee/3C0XfJW";

const steps = [
  {
    title: "1. LINE相談",
    body:
      "時計の写真・型番・症状をLINEでお送りください。分かる範囲で大丈夫です。時計全体、裏蓋、リューズまわり、型番や刻印、不具合箇所が分かる写真があると、受付前の判断がしやすくなります。",
  },
  {
    title: "2. 概算案内",
    body:
      "写真と症状から、修理できそうかどうか、必要になりそうな作業、費用感の目安をご案内します。概算は受付前の目安であり、正式な金額は実物確認後のお見積りとなります。",
  },
  {
    title: "3. 郵送・お持ち込み",
    body:
      "概算内容をご確認いただいたうえで、修理をご希望の場合は時計をお預かりします。郵送の場合は、時計が動かないように保護し、緩衝材を使って梱包してください。",
    note:
      "無料見積りキットは現在ご用意していません。時計ごとに大きさや状態が異なるため、お手元の箱や緩衝材を使い、無理なく安全に送れる方法をご案内しています。",
  },
  {
    title: "4. 受付",
    body:
      "時計到着後、外装状態・動作状態・付属品などを確認して受付します。受付後は、修理内容や進捗を確認できる共有ページをご案内できる場合があります。",
  },
  {
    title: "5. 正式見積り",
    body:
      "実物を確認し、必要な作業や部品交換の有無を整理したうえで正式見積りをご案内します。通常は受付後に確認を進めますが、時計の状態や部品調査の内容によって日数が変わる場合があります。",
    note:
      "概算と正式見積りの差が大きくならないよう、受付前にできる限り現実に近い費用感をお伝えするよう心がけています。",
  },
  {
    title: "6. 修理",
    body:
      "お見積り内容をご確認いただいた後、修理を進めます。分解・洗浄・注油・調整・部品交換など、時計の状態に応じて必要な工程を判断します。",
    note:
      "修理期間は、部品の入手状況や作業内容によって変わります。部品調達が必要な場合や特殊な修理では、通常よりお時間をいただくことがあります。",
  },
  {
    title: "7. 納品・保証",
    body:
      "修理完了後、動作確認・精度確認・必要に応じた防水確認を行い、納品します。オーバーホールには1年保証をお付けしています。",
    note:
      "保証内容は修理内容や時計の状態によって異なる場合があります。対象範囲については納品時にご案内します。",
  },
];

export default function RepairFlowPage() {
  return (
    <main className="repair-flow-page">
      <header className="flow-header">
        <Link href="/" className="flow-brand">
          吉田時計修理工房
        </Link>
        <nav className="flow-nav" aria-label="ページナビゲーション">
          <Link href="/">トップへ戻る</Link>
          <a href={LINE_URL}>LINE相談</a>
        </nav>
      </header>

      <section className="flow-hero">
        <p className="flow-eyebrow">修理の流れ</p>
        <h1>LINE相談から納品まで、修理の進み方をご確認いただけます。</h1>
        <p className="flow-lead">
          時計の状態や部品の入手状況によって日数や内容は変わりますが、基本的な流れは共通です。
          <br />
          受付前の概算相談から、正式見積り、修理、納品までの流れをご案内します。
        </p>
        <div className="flow-actions">
          <a href={LINE_URL} className="flow-primary">
            LINEで相談する
          </a>
          <Link href="/" className="flow-secondary">
            トップへ戻る
          </Link>
        </div>
      </section>

      <section className="flow-section">
        <div className="flow-step-list">
          {steps.slice(0, 5).map((step) => (
            <article key={step.title} className="flow-step-card">
              <h2>{step.title}</h2>
              <p>{step.body}</p>
              {step.note ? <p className="flow-note">{step.note}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="flow-section flow-panel">
        <div className="flow-section-heading">
          <span>お願い</span>
          <h2>概算範囲内だった場合のお願い</h2>
        </div>
        <p>
          概算は、受付前にできる限り現実に近い金額をご案内するためのものです。
          正式見積りが概算の範囲内、または概算以下の場合は、できる限りそのまま修理進行をご検討いただけますと幸いです。
        </p>
      </section>

      <section className="flow-section">
        <div className="flow-step-list">
          {steps.slice(5).map((step) => (
            <article key={step.title} className="flow-step-card">
              <h2>{step.title}</h2>
              <p>{step.body}</p>
              {step.note ? <p className="flow-note">{step.note}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="flow-final">
        <h2>まずは写真を送ってご相談ください</h2>
        <p>
          時計の写真・型番・症状をお送りいただければ、受付前の概算相談が可能です。
        </p>
        <a href={LINE_URL} className="flow-primary">
          LINEで相談する
        </a>
      </section>

      <footer className="flow-footer">
        <Link href="/">トップへ戻る</Link>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .repair-flow-page {
          min-height: 100vh;
          background: #ffffff;
          color: #1a2b4b;
          font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
        }

        .flow-header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .flow-brand {
          color: #1a2b4b;
          font-size: 1.18rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-decoration: none;
        }

        .flow-nav {
          display: flex;
          align-items: center;
          gap: 18px;
          font-size: 0.92rem;
          font-weight: 700;
        }

        .flow-nav a,
        .flow-footer a {
          color: #1a2b4b;
          text-decoration: none;
        }

        .flow-nav a:last-child {
          padding: 10px 18px;
          border: 1px solid #c8d4e1;
          border-radius: 4px;
        }

        .flow-hero {
          max-width: 960px;
          margin: 0 auto;
          padding: 92px 24px 72px;
          text-align: center;
        }

        .flow-eyebrow {
          margin: 0 0 18px;
          color: #20385d;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        .flow-hero h1 {
          margin: 0;
          color: #101b2c;
          font-size: clamp(2.2rem, 5vw, 4rem);
          line-height: 1.22;
          letter-spacing: 0;
        }

        .flow-lead {
          max-width: 780px;
          margin: 26px auto 0;
          color: #405166;
          font-size: 1rem;
          line-height: 2;
          font-weight: 500;
        }

        .flow-actions {
          margin-top: 34px;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 14px;
        }

        .flow-primary,
        .flow-secondary {
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

        .flow-primary {
          background: #1a2b4b;
          border: 1px solid #1a2b4b;
          color: #ffffff;
        }

        .flow-secondary {
          background: #ffffff;
          border: 1px solid #b8c5d4;
          color: #1a2b4b;
        }

        .flow-section {
          max-width: 960px;
          margin: 0 auto 26px;
          padding: 0 24px;
        }

        .flow-step-list {
          display: grid;
          gap: 16px;
        }

        .flow-step-card {
          padding: 28px 30px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
        }

        .flow-step-card h2 {
          margin: 0 0 14px;
          color: #1a2b4b;
          font-size: clamp(1.3rem, 2.5vw, 1.75rem);
          letter-spacing: 0.03em;
        }

        .flow-step-card p,
        .flow-panel p {
          margin: 0;
          color: #405166;
          line-height: 2;
          font-weight: 500;
        }

        .flow-note {
          margin-top: 14px !important;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          color: #53657b !important;
          font-size: 0.95rem;
        }

        .flow-panel {
          box-sizing: border-box;
          padding: 30px 34px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          box-shadow: 0 12px 28px rgba(26, 43, 75, 0.05);
        }

        .flow-section-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 18px;
        }

        .flow-section-heading span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 58px;
          height: 34px;
          padding: 0 12px;
          border: 1px solid #d6e0ea;
          border-radius: 999px;
          color: #20385d;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .flow-section-heading h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.35rem, 3vw, 1.9rem);
          letter-spacing: 0.03em;
        }

        .flow-final {
          max-width: 960px;
          margin: 72px auto 0;
          box-sizing: border-box;
          padding: 46px 34px;
          border: 1px solid #d6e0ea;
          border-radius: 10px;
          background: #f8fafc;
          text-align: center;
        }

        .flow-final h2 {
          margin: 0;
          color: #1a2b4b;
          font-size: clamp(1.55rem, 3vw, 2.2rem);
        }

        .flow-final p {
          max-width: 640px;
          margin: 18px auto 28px;
          color: #405166;
          line-height: 1.9;
          font-weight: 500;
        }

        .flow-footer {
          max-width: 960px;
          margin: 0 auto;
          padding: 34px 24px 48px;
          text-align: center;
          font-size: 0.92rem;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .flow-header {
            padding: 22px 20px;
            align-items: flex-start;
            flex-direction: column;
          }

          .flow-nav {
            width: 100%;
            justify-content: space-between;
          }

          .flow-hero {
            padding: 64px 20px 54px;
          }

          .flow-lead {
            font-size: 0.96rem;
            line-height: 1.9;
          }

          .flow-actions {
            flex-direction: column;
          }

          .flow-primary,
          .flow-secondary {
            width: 100%;
          }

          .flow-section {
            padding: 0 20px;
          }

          .flow-step-card,
          .flow-panel {
            padding: 24px 22px;
          }

          .flow-section-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 12px;
          }

          .flow-final {
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
