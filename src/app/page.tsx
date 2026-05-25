import { prisma } from "@/lib/prisma";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */

export const dynamic = 'force-dynamic';

// --- 1. CSS (Original) ---
const GLOBAL_CSS = `
/* デザイン模倣・青基調：シンプルで洗練 */
:root {
    --primary-color: #1a2b4b; /* 深いネイビー */
    --accent-color: #2563eb; /* 鮮やかなブルー */
    --text-color: #333333;
    --bg-color: #f4f7fa; /* 非常に薄いブルーグレー */
    --white: #ffffff;
    --gold: #b59410; /* 洗練されたゴールド */
    --gray: #e2e8f0;
}

body {
    font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif !important;
    margin: 0;
    padding: 0;
    color: var(--text-color);
    background-color: var(--white);
    line-height: 1.6;
}

h1, h2, h3 { margin: 0; font-weight: bold; letter-spacing: 0.05em;}
a { text-decoration: none; color: inherit; transition: 0.3s; }

/* ヘッダー */
header {
    background-color: var(--white);
    border-bottom: 1px solid var(--gray);
    padding: 10px 0;
    position: fixed;
    width: 100%;
    top: 0;
    z-index: 1000;
}
.nav-container {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 20px;
}

.logo-wrapper { display: flex; align-items: center; gap: 15px; }
.logo-img { height: 80px; width: auto; display: block; } 
.site-name { font-size: 1.5rem; color: var(--primary-color); font-weight: 600; }

nav ul { list-style: none; display: flex; gap: 25px; padding: 0; margin: 0;}
nav a { color: var(--text-color); font-size: 0.9rem; font-weight: 500; }
nav a:hover { color: var(--accent-color); }

/* トップページ（スライドショー） */
.hero {
    position: relative;
    margin-top: 101px;
    overflow: hidden;
    background: linear-gradient(180deg, #ffffff 0%, #f7fafc 72%, #ffffff 100%);
    color: var(--primary-color);
}
.hero-inner {
    max-width: 1180px;
    margin: 0 auto;
    padding: 72px 24px 64px;
    text-align: center;
}
.hero-eyebrow {
    margin: 0 0 18px;
    color: #20385d;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.08em;
}
.hero-title {
    margin: 0;
    color: #101b2c;
    font-size: clamp(2.7rem, 5vw, 4.5rem);
    line-height: 1.18;
    font-weight: 600;
    letter-spacing: 0;
}
.hero-title-line {
    display: block;
}
.hero-lead {
    max-width: 760px;
    margin: 26px auto 0;
    color: #405166;
    font-size: 1rem;
    line-height: 2;
    font-weight: 500;
}
.hero-actions {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 34px;
}
.btn {
    display: inline-block; padding: 18px 50px;
    background-color: var(--accent-color); color: var(--white);
    border-radius: 4px; font-weight: bold; font-size: 1.1rem;
}
.btn:hover { background-color: #1d4ed8; transform: translateY(-2px); }

.hero .btn {
    min-width: 190px;
    padding: 15px 26px;
    border-radius: 4px;
    border: 1px solid transparent;
    font-size: 0.98rem;
    box-shadow: none;
}
.hero-line-btn {
    background: var(--primary-color);
}
.hero-line-btn:hover {
    background: #13243f;
}
.hero-case-btn {
    background: #ffffff;
    color: var(--primary-color);
    border-color: #b8c5d4 !important;
}
.hero-case-btn:hover {
    background: #f8fafc;
    color: var(--primary-color);
}
.hero-photo-band {
    position: relative;
    max-width: 1160px;
    height: clamp(320px, 34vw, 410px);
    margin: 54px auto 0;
    overflow: hidden;
    border: 1px solid rgba(26, 43, 75, 0.1);
    border-radius: 10px;
    background: #e5ebf1;
    box-shadow: 0 18px 44px rgba(15, 39, 72, 0.1);
}
.hero-photo-slide {
    position: absolute;
    inset: 0;
    opacity: 0;
    animation: heroPhotoFade 18s ease-in-out infinite;
}
.hero-photo-slide:first-child {
    opacity: 1;
}
.hero-photo-slide img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    filter: brightness(1.06) contrast(1.04);
    transform: scale(1.03);
}
@keyframes heroPhotoFade {
    0%, 31% { opacity: 1; }
    39%, 92% { opacity: 0; }
    100% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
    .hero-photo-slide {
        animation: none;
        opacity: 0;
    }
    .hero-photo-slide:first-child {
        opacity: 1;
    }
}

/* スライドナビゲーション */
.dots-container {
    position: absolute; bottom: 30px; width: 100%; text-align: center; z-index: 2;
}
.dot {
    cursor: pointer; height: 12px; width: 12px; margin: 0 5px;
    background-color: rgba(255,255,255,0.5); border-radius: 50%;
    display: inline-block; transition: background-color 0.6s ease;
}
.dot.active, .dot:hover { background-color: var(--white); }

/* コンテンツ共通 */
.section { padding: 100px 20px; }
.container { max-width: 1000px; margin: 0 auto; }
.section-title {
    text-align: center;
    font-size: 2.4rem;
    color: var(--primary-color);
    margin-bottom: 60px; position: relative;
}
.section-title::after {
    content: ""; display: block; width: 80px; height: 3px;
    background-color: var(--gold); margin: 25px auto 0;
}

/* こだわりセクション */
.strength-item { display: flex; align-items: center; gap: 50px; margin-bottom: 80px; }
.strength-item:nth-child(even) { flex-direction: row-reverse; }
.strength-img { 
    flex: 1; border-radius: 8px; overflow: hidden; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.1); height: 300px; 
    background-color: #ddd;
}
.strength-img img { width: 100%; height: 100%; display: block; object-fit: cover; }
.strength-text { flex: 1; }
.strength-text h3 { font-size: 1.8rem; color: var(--primary-color); margin-bottom: 15px; }
.strength-text p { font-size: 1.05rem; color: #555; line-height: 1.8; }

/* 料金比較表 */
.price-section table {
    width: 100%; border-collapse: collapse; border: 1px solid var(--gray);
    background: var(--white); border-radius: 8px; overflow: hidden;
    box-shadow: 0 4px 10px rgba(0,0,0,0.05); font-size: 0.95rem;
}
.price-section th, .price-section td {
    padding: 15px 10px; border: 1px solid var(--gray); text-align: center;
}
.our-price {
    background-color: #eff6ff; font-weight: bold; color: var(--accent-color);
}
.table-responsive {
    overflow-x: auto; -webkit-overflow-scrolling: touch;
}

/* 修理事例（スライダー＆WordPress検索） */
.cases-section { background-color: var(--bg-color); }

/* 検索フォームのデザイン */
.case-search-container { 
    text-align: center; margin-bottom: 40px; 
    display: flex; justify-content: center;
}
.wp-search-form {
    display: flex; width: 100%; max-width: 500px; gap: 10px;
}
.wp-search-input {
    flex: 1; padding: 15px; 
    border: 2px solid var(--gray); border-radius: 30px;
    font-size: 1rem; outline: none; transition: 0.3s;
}
.wp-search-input:focus { border-color: var(--accent-color); }
.wp-search-btn {
    padding: 0 30px; background-color: var(--primary-color);
    color: var(--white); border: none; border-radius: 30px;
    font-weight: bold; cursor: pointer; transition: 0.3s;
}
.wp-search-btn:hover { background-color: var(--accent-color); }

/* スライダー */
.cases-slider-wrapper { position: relative; padding: 0 40px; }
.cases-slider {
    display: flex; gap: 30px; overflow-x: auto; scroll-snap-type: x mandatory;
    padding-bottom: 20px; scrollbar-width: none;
}
.cases-slider::-webkit-scrollbar { display: none; }

.case-card {
    min-width: 320px; flex: 0 0 auto; background: var(--white);
    border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);
    scroll-snap-align: center; transition: 0.3s;
}
.case-card:hover { transform: translateY(-5px); }

.case-img { height: 220px; background-size: cover; background-position: center; background-color: #eee; }
.case-body { padding: 25px; }
.case-meta { font-size: 0.85rem; color: #888; margin-bottom: 10px; display: flex; justify-content: space-between;}
.case-title { font-size: 1.4rem; color: var(--primary-color); margin-bottom: 10px; }
.case-details { margin-bottom: 15px; font-size: 0.95rem; }
.case-details dt { font-weight: bold; color: #555; float: left; clear: left; width: 80px;}
.case-details dd { margin-left: 80px; margin-bottom: 5px; color: #777;}
.case-price-row {
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid var(--gray); padding-top: 15px; margin-top: 15px;
}
.case-price { font-size: 1.5rem; color: var(--gold); font-weight: bold; }

.slider-btn {
    position: absolute; top: 50%; transform: translateY(-50%);
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--white); color: var(--primary-color);
    border: 1px solid var(--gray); font-size: 1.2rem;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; z-index: 10; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}
.slider-btn.prev { left: -10px; }
.slider-btn.next { right: -10px; }

/* 流れ・保証・FAQ */
.flow-section { background-color: var(--white); }
.flow-steps { display: flex; justify-content: space-between; margin-bottom: 60px; position: relative; }
.flow-steps::after {
    content: ''; position: absolute; top: 25px; left: 10%; width: 80%; height: 2px; background: var(--gray); z-index: 1;
}
.step { flex: 1; text-align: center; position: relative; z-index: 2; }
.step-icon {
    width: 50px; height: 50px; line-height: 50px; border-radius: 50%;
    background: var(--gray); color: var(--white); font-size: 1.5rem; font-weight: bold; margin: 0 auto 20px;
}
.step.active .step-icon { background: var(--accent-color); }

.step h4 { font-size: 1.15rem; color: var(--primary-color); margin-bottom: 10px; font-weight: bold;}
.step p { font-size: 0.9rem; color: #666; padding: 0 5px; line-height: 1.5;}

.kit-banner {
    background-color: #eff6ff; border: 2px solid var(--accent-color); padding: 40px; border-radius: 8px;
    display: flex; align-items: center; gap: 30px; margin-top: 50px;
}
.kit-icon { font-size: 4rem; color: var(--accent-color); }
.warranty-section { background-color: var(--bg-color); text-align: center;}
.warranty-box {
    background: var(--white); padding: 60px; border-radius: 8px;
    border-top: 5px solid var(--gold); box-shadow: 0 4px 15px rgba(0,0,0,0.05);
}
.warranty-box .guarantee { font-size: 1.8rem; color: var(--gold); font-weight: bold; display: block; margin: 20px 0;}
.faq-item { margin-bottom: 15px; background-color: var(--white); border: 1px solid var(--gray); border-radius: 4px; overflow: hidden;}
.question { padding: 20px; font-weight: bold; color: var(--primary-color); cursor: pointer; display: flex; justify-content: space-between; align-items: center;}
.answer { padding: 0 20px; max-height: 0; overflow: hidden; transition: 0.3s ease-out; color: #555; background-color: #fafafa;}
.faq-item.active .answer { padding: 20px; max-height: 500px; }

/* お問い合わせ */
.contact-section { background-color: var(--primary-color); color: var(--white); text-align: center; padding: 80px 20px;}
.line-wrapper { background: var(--white); color: var(--text-color); padding: 40px; border-radius: 12px; display: inline-block; margin-top: 30px; box-shadow: 0 5px 15px rgba(0,0,0,0.2);}

.qr-code-img { width: 180px; height: auto; margin: 0 auto 20px; display: block; border: 1px solid var(--gray); background-color: #eee;}

.line-btn { background-color: #06c755; margin-top: 15px;}
.line-btn:hover { background-color: #05b34c;}

/* フッター */
footer { background-color: #15213a; color: rgba(255,255,255,0.6); padding: 60px 20px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);}
.footer-logo-img { height: 35px; width: auto; margin-bottom: 15px; opacity: 0.8;} 
.footer-name { font-size: 1.2rem; color: var(--white); margin-bottom: 20px;}
.copyright { font-size: 0.85rem;}

/* レスポンシブ対応 */
@media (max-width: 768px) {
    .nav-container { flex-direction: column; padding: 15px; }
    nav ul { gap: 15px; margin-top: 10px; }
    .hero { margin-top: 130px; }
    .hero-inner { padding: 48px 20px 44px; }
    .hero-title { font-size: 2.35rem; }
    .hero-lead { font-size: 0.95rem; line-height: 1.9; }
    .hero-actions { flex-direction: column; align-items: stretch; }
    .hero .btn { width: 100%; box-sizing: border-box; }
    .hero-photo-band { height: 240px; margin-top: 36px; border-radius: 8px; }
    .section { padding: 60px 20px; }
    .strength-item, .strength-item:nth-child(even) { flex-direction: column; gap: 30px; text-align: center; }
    .cases-grid { grid-template-columns: 1fr; }
    .flow-steps { flex-direction: column; gap: 20px; }
    .flow-steps::after { display: none; }
    .kit-banner { flex-direction: column; text-align: center; }
    .slider-btn { display: none; }
    /* スマホでの検索フォーム調整 */
    .wp-search-form { flex-direction: column; }
    .wp-search-btn { padding: 15px; width: 100%; }
}
`;

// --- 2. HTML Blocks (Original) ---
const HTML_HEADER = `
<header>
    <div class="nav-container">
        <a href="#" class="logo-wrapper">
            <img src="/img/logo.png" alt="ヨシダ時計修理工房 ロゴ" class="logo-img">
            <span class="site-name">ヨシダ時計修理工房</span>
        </a>
        <nav>
            <ul>
                <li><a href="#about">こだわり</a></li>
                <li><a href="#price">料金</a></li>
                <li><a href="#cases">修理事例</a></li>
                <li><a href="#flow">修理の流れ</a></li>
                <li><a href="#contact">お問い合わせ</a></li>
                <li><a href="/cases/biz" style="color:#b59410; font-weight:bold; border:1px solid #b59410; padding:5px 10px; border-radius:4px;">業者様はこちら</a></li>
            </ul>
        </nav>
    </div>
</header>
`;

const HTML_ABOUT_PRICE = `
<section id="about" class="section strengths-section">
    <div class="container">
        <h2 class="section-title">ヨシダ時計修理工房のこだわり</h2>
        
        <div class="strength-item">
            <div class="strength-img">
                <img src="/img/work1.jpg" alt="1級時計修理技能士の技術">
            </div>
            <div class="strength-text">
                <h3>1級時計修理技能士の確かな技術</h3>
                <p>時計修理歴20年、メーカー下請け会社での豊富な経験を持つ1級時計修理技能士が、一点一点丁寧に診断・修理いたします。複雑な機械式時計も安心してお任せください。</p>
                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <img src="/img/work3.jpg" alt="修理風景1" style="width: 48%; border-radius: 4px;">
                    <img src="/img/work4.jpg" alt="修理風景2" style="width: 48%; border-radius: 4px;">
                </div>
            </div>
        </div>

        <div class="strength-item">
            <div class="strength-img">
                <img src="/img/work2.jpg" alt="独自の部品調達ネットワーク">
            </div>
            <div class="strength-text">
                <h3>独自の部品調達ネットワーク</h3>
                <p>国内、海外問わず独自のネットワークを生かし調達可能。メーカーで保有期間が終了した部品や、入手困難なパーツもお探しいたします。また純正部品、社外部品もご希望により柔軟に対応いたします。</p>
            </div>
        </div>

        <div class="strength-item">
            <div class="strength-img">
                <img src="/img/parts-creation.jpg" alt="絶版パーツの復元・作成">
            </div>
            <div class="strength-text">
                <h3>絶版パーツの復元・作成</h3>
                <p>どうしても部品の調達が難しい場合は、旋盤などを用いて部品をゼロから製作することも可能です。他社で「修理不可」とされた時計も、諦めずにご相談ください。</p>
                <img src="/img/dial-hands.jpg" alt="分解パーツ" style="width: 100%; margin-top: 15px; border-radius: 4px;">
            </div>
        </div>

        <div class="strength-item">
            <div class="strength-img">
                <img src="/img/waterproof.jpg" alt="防水性能を可能な限り復活">
            </div>
            <div class="strength-text">
                <h3>防水性能を可能な限り復活</h3>
                <p>元々防水性能を持たせた時計でも、経年によるパッキン等の劣化によりその性能は失われていきます。防水性能が落ち湿気が入るだけでもメンテナンスのスパンが大幅に短くなるため、防水性能を維持することはとても大切です。<br>
                一般的な修理店では交換が簡単な裏蓋パッキンだけの交換で済ませたり、そもそも交換しない場合も多いですが、当店では裏蓋だけでなくリューズのパッキン、クロノグラフの場合プッシュボタンのパッキン、必要であればガラスのパッキンまでも交換し、時計本来の防水性能を発揮できるよう最大限努力しています。</p>
            </div>
        </div>

    </div>
</section>

<section id="price" class="section price-section" style="background-color: #fcfcfc;">
    <div class="container">
        <h2 class="section-title">メーカー別 修理料金比較表</h2>
        <p style="text-align:center; margin-bottom:40px;">
            メーカー正規修理と同等の品質を、よりリーズナブルな価格でご提供します。<br>
            <span style="font-size: 0.9em; color: #666;">※価格は全て税込・参考料金（〜）です。状態により変動する場合がございます。</span>
        </p>
        
        <div class="table-responsive" style="overflow-x: auto;">
            <table style="min-width: 900px;">
                <thead>
                    <tr>
                        <th rowspan="2" style="background-color: var(--primary-color); color: white; vertical-align: middle;">メーカー</th>
                        <th colspan="2" style="background-color: #e2e8f0; color: #333;">クォーツ（電池式）</th>
                        <th colspan="2" style="background-color: #cbd5e1; color: #333;">機械式（3針）</th>
                        <th colspan="2" style="background-color: #94a3b8; color: white;">機械式（クロノ等）</th>
                        <th rowspan="2" style="background-color: var(--primary-color); color: white; vertical-align: middle; width: 15%;">特記事項</th>
                    </tr>
                    <tr>
                        <th style="font-size: 0.9em; background-color: #f1f5f9;">正規料金</th>
                        <th class="our-price" style="font-size: 0.9em;">当店価格</th>
                        <th style="font-size: 0.9em; background-color: #e2e8f0;">正規料金</th>
                        <th class="our-price" style="font-size: 0.9em;">当店価格</th>
                        <th style="font-size: 0.9em; background-color: #cbd5e1;">正規料金</th>
                        <th class="our-price" style="font-size: 0.9em;">当店価格</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="font-weight: bold;">ROLEX</td>
                        <td>-</td>
                        <td class="our-price">-</td>
                        <td>88,000円〜</td>
                        <td class="our-price">30,000円〜</td>
                        <td>100,000円〜</td>
                        <td class="our-price">50,000円〜</td>
                        <td style="font-size: 0.85em; text-align: left;">モデル・年代で変動あり</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">OMEGA</td>
                        <td>70,000円〜</td>
                        <td class="our-price">16,000円〜</td>
                        <td>90,000円〜</td>
                        <td class="our-price">25,000円〜</td>
                        <td>115,000円〜</td>
                        <td class="our-price">40,000円〜</td>
                        <td style="font-size: 0.85em; text-align: left;">コーアクシャルは高め</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">TAG Heuer</td>
                        <td>35,000円〜</td>
                        <td class="our-price">16,000円〜</td>
                        <td>55,000円〜</td>
                        <td class="our-price">25,000円〜</td>
                        <td>85,000円〜</td>
                        <td class="our-price">40,000円〜</td>
                        <td style="font-size: 0.85em; text-align: left;">正規会員価格あり(約3割安)</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">BREITLING</td>
                        <td>50,000円〜</td>
                        <td class="our-price">16,000円〜</td>
                        <td>80,000円〜</td>
                        <td class="our-price">30,000円〜</td>
                        <td>120,000円〜</td>
                        <td class="our-price">40,000円〜</td>
                        <td style="font-size: 0.85em; text-align: left;">正規会員価格あり(半額)</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">IWC</td>
                        <td>50,000円〜</td>
                        <td class="our-price">16,000円〜</td>
                        <td>70,000円〜</td>
                        <td class="our-price">30,000円〜</td>
                        <td>95,000円〜</td>
                        <td class="our-price">50,000円〜</td>
                        <td style="font-size: 0.85em; text-align: left;">-</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">Cartier</td>
                        <td>45,000円〜</td>
                        <td class="our-price">20,000円〜</td>
                        <td>55,000円〜</td>
                        <td class="our-price">30,000円〜</td>
                        <td>80,000円〜</td>
                        <td class="our-price">50,000円〜</td>
                        <td style="font-size: 0.85em; text-align: left;">-</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">Grand Seiko</td>
                        <td>40,000円〜</td>
                        <td class="our-price">16,000円〜</td>
                        <td>55,000円〜</td>
                        <td class="our-price">25,000円〜</td>
                        <td>85,000円〜</td>
                        <td class="our-price">40,000円〜</td>
                        <td style="font-size: 0.85em; text-align: left;">スプリングドライブは6万円〜</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p style="margin-top: 20px; font-size: 0.9em; text-align: right;">※上記以外のブランドも修理可能です。お気軽にお問い合わせください。</p>
    </div>
</section>
`;

const HTML_FLOW_FOOTER = `
<section id="flow" class="section flow-section">
    <div class="container">
        <h2 class="section-title">郵送修理の流れ</h2>
        <div class="flow-steps">
            <div class="step active">
                <div class="step-icon">1</div>
                <h4>ご相談・概算見積もり</h4>
                <p>LINEまたはフォームよりご連絡ください。</p>
            </div>
            <div class="step active">
                <div class="step-icon">2</div>
                <h4>配送キット受取・発送</h4>
                <p>キットに時計を入れ、着払いで発送。</p>
            </div>
            <div class="step">
                <div class="step-icon">3</div>
                <h4>正式なお見積り</h4>
                <p>到着した時計を点検し、正確な費用をご案内。</p>
            </div>
            <div class="step">
                <div class="step-icon">4</div>
                <h4>修理・お支払い</h4>
                <p>修理完了後、銀行振込（入金確認後に発送）または代金引換（ヤマト運輸）にてご返送いたします。</p>
            </div>
        </div>
        <div class="kit-banner">
            <div class="kit-icon">📦</div>
            <div class="kit-text">
                <h3>無料配送キットをご用意しております</h3>
                <p>「箱がない」「送り方が不安」という方もご安心ください。<br>専用の梱包材、緩衝材、着払い伝票をセットにして無料でお送りします。</p>
            </div>
        </div>
    </div>
</section>

<section id="faq" class="section faq-section" style="background-color: white;">
    <div class="container">
        <h2 class="section-title">よくある質問</h2>
        <div class="faq-item">
            <div class="question">Q. 古い時計でも修理できますか？ <span class="faq-icon">▼</span></div>
            <div class="answer">A. はい、可能です。絶版パーツも作成技術により対応できるケースが多いです。まずはご相談ください。</div>
        </div>
        <div class="faq-item">
            <div class="question">Q. 見積もり後のキャンセルは無料ですか？ <span class="faq-icon">▼</span></div>
            <div class="answer">A. はい、見積もりは完全無料です。キャンセル時の返送料のみご負担いただきます。</div>
        </div>
        <div class="faq-item">
            <div class="question">Q. 支払い方法は何がありますか？ <span class="faq-icon">▼</span></div>
            <div class="answer">A. 銀行振込、代金引換（ヤマト運輸 コレクト）に対応しております。</div>
        </div>
    </div>
</section>

<section id="contact" class="contact-section section">
    <div class="container">
        <h2>お問い合わせ</h2>
        <p>時計の不調、メンテナンス、お気軽にご相談ください。</p>
        <div class="line-wrapper">
            <img src="/img/line-qr.png" alt="公式LINE QRコード" class="qr-code-img">
            <h3>公式LINEで相談する</h3>
            <p>写真を送るだけで、簡単お見積もり</p>
            <a href="https://lin.ee/3C0XfJW" class="btn line-btn">LINE 友だち追加</a>
        </div>
    </div>
</section>

<footer>
    <div class="container">
        <img src="/img/logo.png" alt="ヨシダ時計修理工房 ロゴ" class="footer-logo-img">
        <div class="footer-name">ヨシダ時計修理工房</div>
        <p class="copyright">&copy; 2026 ヨシダ時計修理工房 All rights reserved.</p>
    </div>
</footer>
`;

const heroImages = [
    {
        src: "/img/DSCN0385.JPG",
        alt: "\u6642\u8a08\u30e0\u30fc\u30d6\u30e1\u30f3\u30c8\u3092\u8abf\u6574\u3059\u308b\u7cbe\u5bc6\u4f5c\u696d",
        position: "center 62%",
    },
    {
        src: "/img/DSCN0392.JPG",
        alt: "\u5206\u89e3\u3057\u305f\u6642\u8a08\u90e8\u54c1\u3092\u6574\u7136\u3068\u4e26\u3079\u305f\u72b6\u614b",
        position: "center 50%",
    },
    {
        src: "/img/DSCN0382.JPG",
        alt: "\u56fa\u5b9a\u53f0\u306b\u7f6e\u3044\u305f\u6642\u8a08\u30e0\u30fc\u30d6\u30e1\u30f3\u30c8\u3068\u5468\u8fba\u90e8\u54c1",
        position: "center 55%",
    },
];

export default async function TopPage() {
    const sliderRepairs = await prisma.repair.findMany({
        where: { isPublicB2C: true },
        include: {
            watch: { include: { brand: true, model: true } },
            photos: true,
            estimate: { include: { items: true } }
        },
        orderBy: { deliveryDateActual: 'desc' },
        take: 10
    });

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />

            <div dangerouslySetInnerHTML={{ __html: HTML_HEADER }} />

            {/* Hero */}
            <section className="hero">
                <div className="hero-inner">
                    <p className="hero-eyebrow">{"\u4fee\u7406\u6b7420\u5e74\u30fb1\u7d1a\u6642\u8a08\u4fee\u7406\u6280\u80fd\u58eb"}</p>
                    <h1 className="hero-title">
                        <span className="hero-title-line">{"\u4ed6\u5e97\u3067\u65ad\u3089\u308c\u305f\u6642\u8a08\u3082\u3001"}</span>
                        <span className="hero-title-line">{"\u307e\u305a\u3054\u76f8\u8ac7\u304f\u3060\u3055\u3044\u3002"}</span>
                    </h1>
                    <p className="hero-lead">
                        {"\u90e8\u54c1\u8abf\u9054\u30fb\u52a0\u5de5\u30fb\u88fd\u4f5c\u307e\u3067\u542b\u3081\u3066\u3001\u4fee\u7406\u306e\u53ef\u80fd\u6027\u3092\u63a2\u308a\u307e\u3059\u3002"}<br />
                        {"LINE\u3067\u5199\u771f\u30fb\u578b\u756a\u30fb\u75c7\u72b6\u3092\u78ba\u8a8d\u3057\u306a\u304c\u3089\u3001\u53d7\u4ed8\u524d\u306b\u3067\u304d\u308b\u9650\u308a\u73fe\u5b9f\u306b\u8fd1\u3044\u6982\u7b97\u3092\u3054\u6848\u5185\u3057\u307e\u3059\u3002"}
                    </p>
                    <div className="hero-actions">
                        <a href="https://lin.ee/3C0XfJW" className="btn hero-line-btn">{"LINE\u3067\u76f8\u8ac7\u3059\u308b"}</a>
                        <Link href="/cases/gallery" className="btn hero-case-btn">{"\u4fee\u7406\u4e8b\u4f8b\u3092\u691c\u7d22\u3059\u308b"}</Link>
                    </div>
                    <div className="hero-photo-band" aria-label="\u6642\u8a08\u4fee\u7406\u4f5c\u696d\u306e\u5199\u771f">
                        {heroImages.map((image, index) => (
                            <div
                                className="hero-photo-slide"
                                key={image.src}
                                style={{ animationDelay: `${index * 6}s` }}
                            >
                                <img src={image.src} alt={image.alt} style={{ objectPosition: image.position }} />
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <div dangerouslySetInnerHTML={{ __html: HTML_ABOUT_PRICE }} />

            {/* Dynamic Repair Cases */}
            <section id="cases" className="section cases-section">
                <div className="container">
                    <h2 className="section-title">修理事例</h2>
                    <p style={{ textAlign: "center", marginBottom: "20px", fontSize: "0.9rem", color: "#666" }}>
                        最新の修理事例を公開しています。<br />ブランド名や型番で検索してください。
                    </p>

                    <div className="case-search-container">
                        <form action="/cases/gallery" method="get" className="wp-search-form">
                            <input type="text" name="q" placeholder="ブランド・型番で検索（例：ロレックス）" className="wp-search-input" required />
                            <button type="submit" className="wp-search-btn">検索</button>
                        </form>
                    </div>

                    <div className="cases-slider-wrapper">
                        <div className="cases-slider" id="cases-slider">
                            {/* Dynamic Items */}
                            {sliderRepairs.map((repair) => {
                                const heroImage = repair.photos.length > 0
                                    ? `/uploads/${repair.photos[0].storageKey}`
                                    : "";
                                const title = repair.publicTitle || `${repair.watch.brand.name} ${repair.watch.model.name}`;
                                const price = repair.estimate?.technicalFee ? `${repair.estimate.technicalFee.toLocaleString()}円` : "お見積り";

                                return (
                                    <Link key={repair.id} href="/cases/gallery" className="case-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                                        <div className="case-img" style={{ backgroundImage: `url('${heroImage}')` }}></div>
                                        <div className="case-body">
                                            <div className="case-meta"><span>{repair.watch.brand.name}</span><span>{repair.deliveryDateActual?.toLocaleDateString("ja-JP", { timeZone: 'Asia/Tokyo' })}</span></div>
                                            <h3 className="case-title">{title}</h3>
                                            <dl className="case-details">
                                                <dt>内容:</dt><dd>オーバーホール</dd>
                                                <dt>納期:</dt><dd>約3週間</dd>
                                            </dl>
                                            <div className="case-price-row">
                                                <span className="case-price-label">参考料金</span>
                                                <span className="case-price">{price}</span>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}

                            {sliderRepairs.length === 0 && (
                                <div style={{ width: '100%', textAlign: 'center', color: '#999', padding: '40px' }}>現在公開中の修理事例はありません。</div>
                            )}

                        </div>
                        <div className="slider-btn next" style={{ cursor: 'pointer' }}>&#10095;</div>
                    </div>
                </div>
            </section>

            <div dangerouslySetInnerHTML={{ __html: HTML_FLOW_FOOTER }} />
        </>
    );
}
