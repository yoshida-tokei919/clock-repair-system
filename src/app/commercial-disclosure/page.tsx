import Link from "next/link";
import { JsonLd, breadcrumbJsonLd, fixedPageSeo } from "@/lib/seo";

const LINE_URL = "https://lin.ee/3C0XfJW";

export const metadata = fixedPageSeo["/commercial-disclosure"].metadata;

export default function CommercialDisclosurePage() {
  return (
    <main className="disclosure-page">
      <JsonLd data={breadcrumbJsonLd("/commercial-disclosure")} />
      <header className="disclosure-header">
        <Link href="/" className="brand" aria-label="ヨシダ時計修理工房 トップページ">
          ヨシダ時計修理工房
        </Link>
        <nav aria-label="公開ページナビゲーション">
          <Link href="/price-quality">修理料金</Link>
          <a href={LINE_URL}>LINEで相談する</a>
        </nav>
      </header>

      <section className="disclosure-hero">
        <p>COMMERCIAL DISCLOSURE</p>
        <h1>特定商取引法に基づく表記</h1>
      </section>

      <section className="disclosure-content" aria-label="特定商取引法に基づく表記の内容">
        <dl>
          <div><dt>販売事業者</dt><dd>ヨシダ時計修理工房</dd></div>
          <div><dt>運営責任者</dt><dd>吉田 周平</dd></div>
          <div><dt>所在地</dt><dd>兵庫県神戸市<br />詳細な所在地については、請求があった場合に遅滞なく開示いたします。</dd></div>
          <div><dt>電話番号</dt><dd>請求があった場合に遅滞なく開示いたします。通常の修理相談・受付はLINEのみで承っております。</dd></div>
          <div><dt>メールアドレス</dt><dd>yoshida.tokei919@gmail.com</dd></div>
          <div><dt>修理相談・受付</dt><dd><a href={LINE_URL}>LINEのみ（LINEで相談する）</a></dd></div>
          <div><dt>修理料金</dt><dd>各料金ページに税込の基本料金を表示しています。時計の状態、必要な作業、交換部品等により料金は変動し、正式な料金は実物確認後のお見積りで確定します。</dd></div>
          <div><dt>見積・点検料</dt><dd>無料</dd></div>
          <div><dt>修理料金以外に必要な費用</dt><dd>お客様から当工房への発送送料はお客様のご負担です。オーバーホールまたはムーブメント交換をご依頼の場合、当工房からの返送送料は当工房が負担します。その他の場合の返送送料および銀行振込手数料はお客様のご負担です。</dd></div>
          <div><dt>支払方法</dt><dd>銀行振込</dd></div>
          <div><dt>支払時期</dt><dd>修理完了のご連絡後、7日以内にお支払いください。</dd></div>
          <div><dt>役務提供の時期</dt><dd>正式なお見積りをご承認いただいた後に修理を開始します。修理期間は時計の状態、修理内容、部品の状況により異なり、個別にご案内します。</dd></div>
          <div><dt>キャンセル</dt><dd>正式なお見積りのご承認前はキャンセルできます。返送送料はお客様のご負担です。</dd></div>
          <div><dt>作業開始後のキャンセル</dt><dd>作業料金はいただきません。ただし、返品できない部品代、実際に発生した調達費用、返送送料はお客様のご負担です。</dd></div>
          <div><dt>修理後の不具合・保証</dt><dd>オーバーホールには1年間の保証を設けています。保証対象となる不具合については、無償で再調整・再修理を行います。<br /><br />その他の修理については、修理した箇所と同一箇所の不具合、または交換した部品そのものの不具合を、修理完了後3か月間の保証対象とします。<br /><br />ただし、オーバーホールを行っていない時計について、油切れ・摩耗・汚れ等、オーバーホールを行っていないことに起因する不具合は、修理箇所と同一箇所に症状が現れた場合であっても保証対象外とします。電池交換は保証対象外です。</dd></div>
          <div><dt>返品・交換</dt><dd>修理という役務の性質上、お客様都合による修理後の返品・交換はお受けしていません。不具合がある場合はLINEよりご連絡ください。</dd></div>
        </dl>
      </section>

      <footer className="disclosure-footer">
        <Link href="/">トップへ戻る</Link>
        <a href={LINE_URL}>LINEで相談する</a>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .disclosure-page { min-height: 100vh; background: #ffffff; color: #17233d; font-family: Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; }
        .disclosure-header { max-width: 1080px; margin: 0 auto; padding: 22px 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 1px solid #dbe5f3; }
        .brand { color: #183f78; font-weight: 700; text-decoration: none; }
        .disclosure-header nav, .disclosure-footer { display: flex; gap: 18px; flex-wrap: wrap; }
        .disclosure-header nav a, .disclosure-footer a { color: #235a9f; text-decoration: none; }
        .disclosure-header nav a:hover, .disclosure-footer a:hover, .disclosure-content a:hover { text-decoration: underline; }
        .disclosure-hero { max-width: 1080px; margin: 0 auto; padding: 72px 24px 42px; }
        .disclosure-hero p { margin: 0 0 10px; color: #3777bd; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.12em; }
        .disclosure-hero h1 { margin: 0; color: #173b70; font-size: clamp(1.8rem, 4vw, 2.7rem); }
        .disclosure-content { max-width: 1080px; margin: 0 auto; padding: 0 24px 64px; }
        .disclosure-content dl { margin: 0; border-top: 2px solid #2e68a9; }
        .disclosure-content dl > div { display: grid; grid-template-columns: minmax(180px, 0.32fr) 1fr; border-bottom: 1px solid #dbe5f3; }
        .disclosure-content dt { padding: 22px 24px; background: #f3f8fe; color: #173b70; font-weight: 700; }
        .disclosure-content dd { margin: 0; padding: 22px 24px; line-height: 1.9; }
        .disclosure-content dd a { color: #235a9f; font-weight: 700; }
        .disclosure-footer { max-width: 1080px; margin: 0 auto; padding: 28px 24px 48px; justify-content: center; border-top: 1px solid #dbe5f3; }
        @media (max-width: 640px) {
          .disclosure-header { align-items: flex-start; flex-direction: column; }
          .disclosure-content dl > div { grid-template-columns: 1fr; }
          .disclosure-content dt { padding-bottom: 10px; }
          .disclosure-content dd { padding-top: 10px; }
        }
      `,
        }}
      />
    </main>
  );
}
