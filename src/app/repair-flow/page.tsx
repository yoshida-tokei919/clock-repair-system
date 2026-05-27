import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "詳しい流れとポイント | ヨシダ時計修理工房",
  description:
    "LINE相談から納品までの流れと、概算、見積り、梱包、交換部品、保証についてのポイントをご案内します。",
};

const LINE_URL = "https://lin.ee/3C0XfJW";

const steps = [
  {
    title: "01 LINE相談",
    body:
      "時計の写真と、分かる範囲で症状や気になる点をLINEでお送りください。時計の正面、側面（リューズ側）、裏側の写真をご用意いただくとスムーズです。刻印などが読める写真があると、より現実に近い概算をご案内しやすくなります。",
    point:
      "ご相談いただいただけで、修理受付や作業開始になることはありません。無理に修理をお勧めすることもございませんので、安心してお問い合わせください。",
  },
  {
    title: "02 概算案内",
    body:
      "受付前に、できる限り現実に近い概算をご案内します。写真や症状から、修理の見込み、必要になりそうな作業、費用感の目安を確認します。",
    point:
      "概算は受付前の目安であり、正式な金額は実物確認後のお見積りでのご案内となります。",
  },
  {
    title: "03 郵送",
    body:
      "概算内容をご確認いただいたうえで、修理をご希望の場合は時計をお送りください。時計が動かないように、緩衝材を使って梱包してください。",
    point:
      "お手元の箱や緩衝材を使った安全な梱包方法をご案内しています。専用キットの到着を待つ必要がなく、資材費も抑えやすい方法です。当工房へお送りいただく際の送料はお客様にご負担をお願いしております。修理完了後の返送料は、当工房にて負担いたします。",
  },
  {
    title: "04 受付",
    body:
      "時計到着後、外装状態・動作状態・付属品などを確認して受付します。受付後は、修理内容や進捗を確認できる共有ページをご案内します。",
  },
  {
    title: "05 正式見積り",
    body:
      "お預かりした時計を拝見し、必要な作業内容や部品交換の有無を確認したうえで、正式見積りと納期の目安をご案内します。正式見積りは、通常、受付後数日〜1週間ほどでご案内します。",
    point:
      "部品調査や特殊な修理が必要な場合は、通常よりお時間をいただくことがあります。その場合は、確認に時間がかかる理由や目安をお伝えします。",
  },
  {
    title: "06 承認・キャンセル",
    body:
      "作業内容と金額をご確認いただき、修理を進めるか返却するかをお選びください。作業は、内容にご納得いただいてから進めます。",
    point:
      "正式見積り後に金額や修理内容が変わることは基本的にありませんが、万一変更がある場合は事前にお伝えします。内容にご不明点や不安がある場合は、その時点でご相談ください。修理を進めず返却することも可能です。",
  },
  {
    title: "07 修理",
    body:
      "分解・洗浄・注油・調整・部品交換など、時計の状態に応じて必要な修理を行います。部品の在庫状況や作業内容にもよりますが、オーバーホールの場合、作業完了までに通常2週間〜1か月ほどかかります。",
    point:
      "時計の状態や想定外の不具合により、予定よりお時間をいただく場合があります。その場合は、分かった時点でご連絡します。",
  },
  {
    title: "08 納品・保証",
    body:
      "修理完了後、動作確認・精度確認・必要に応じた防水確認を行い、納品します。オーバーホールには1年保証をお付けしています。",
    point:
      "落下・水入り・外装破損・消耗部品・お客様の使用環境による不具合など、保証対象外となる場合があります。部分修理は、修理内容や時計の状態により保証対象外となる場合があります。",
  },
];

export default function RepairFlowPage() {
  return (
    <main className="repair-flow-page">
      <header className="flow-header">
        <Link href="/" className="flow-brand">
          ヨシダ時計修理工房
        </Link>
        <nav className="flow-nav" aria-label="ページナビゲーション">
          <Link href="/">トップへ戻る</Link>
          <a href={LINE_URL}>LINE相談</a>
        </nav>
      </header>

      <section className="flow-hero">
        <p className="flow-eyebrow">修理の流れ</p>
        <h1>詳しい流れとポイント</h1>
        <p className="flow-lead">
          LINE相談から納品までの流れと、受付前に確認しておきたいポイントをまとめました。
          <br />
          時計を送る前に、概算、見積り、梱包、交換部品、保証の考え方をご確認いただけます。
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
          {steps.map((step) => (
            <article key={step.title} className="flow-step-card">
              <h2>{step.title}</h2>
              <p>{step.body}</p>
              {step.point ? (
                <div className="flow-note">
                  <strong>ポイント：</strong>
                  <p>{step.point}</p>
                </div>
              ) : null}
              {step.title === "03 郵送" ? (
                <Link href="/packing-guide" className="flow-pack-link">
                  梱包方法を見る
                </Link>
              ) : null}
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

      <section className="flow-section flow-panel">
        <div className="flow-section-heading">
          <span>部品</span>
          <h2>交換部品について</h2>
        </div>
        <p>
          純正部品が入手できる場合は、まず純正部品での対応を検討します。
          一方で、純正部品が入手困難な場合や高額な場合、お客様にとってメリットがあると判断した場合には、品質の良い社外部品や、当工房で製作・加工した部品の使用も含めて複数の選択肢をご提案することがあります。
          <br />
          <br />
          代替部品の使用には注意点もあります。お見積り時にご説明しますが、気になる点があれば事前にご相談ください。
        </p>
      </section>

      <section className="flow-final">
        <h2>まずは写真を送ってご相談ください</h2>
        <p>
          時計の写真や分かる範囲の情報をお送りいただければ、受付前の概算相談が可能です。
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
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          color: #53657b;
          font-size: 0.95rem;
        }

        .flow-note strong {
          display: block;
          margin-bottom: 6px;
          color: #20385d;
        }

        .flow-pack-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 16px;
          padding: 11px 18px;
          border: 1px solid #b8c5d4;
          border-radius: 4px;
          color: #1a2b4b;
          background: #ffffff;
          font-size: 0.92rem;
          font-weight: 700;
          text-decoration: none;
        }

        .flow-pack-link:hover {
          background: #f8fafc;
          border-color: #8fa1b7;
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
