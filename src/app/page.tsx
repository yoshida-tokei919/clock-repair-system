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
.strengths-section {
    background: #fff;
}
.strength-card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
}
.strength-card {
    min-height: 210px;
    display: block;
    box-sizing: border-box;
    padding: 30px 28px;
    border: 1px solid #dce5ee;
    border-radius: 8px;
    background: #fff;
    color: var(--primary-color);
    box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.strength-card:hover {
    transform: translateY(-2px);
    border-color: #c8d4e1;
    box-shadow: 0 14px 30px rgba(26, 43, 75, 0.08);
}
.strength-card-mark {
    width: 34px;
    height: 34px;
    display: block;
    margin-bottom: 20px;
    color: #1a2b4b;
    opacity: 0.76;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
}
.strength-card h3 {
    margin: 0 0 14px;
    color: var(--primary-color);
    font-size: 1.14rem;
    font-weight: 700;
    letter-spacing: 0.03em;
}
.strength-card p {
    margin: 0;
    color: #405166;
    font-size: 0.95rem;
    line-height: 1.85;
}
.strength-card-static:hover {
    transform: none;
    border-color: #dce5ee;
    box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
}

/* 料金比較表 */
.case-finder-section {
    padding: 0 20px 96px;
    background: #fff;
}
.case-finder-panel {
    max-width: 1000px;
    margin: 0 auto;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 30px 44px;
    align-items: center;
    padding: 38px 44px;
    border: 1px solid #dce5ee;
    border-radius: 10px;
    background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
    box-shadow: 0 12px 28px rgba(26, 43, 75, 0.05);
}
.case-finder-panel h2 {
    margin: 0 0 14px;
    color: var(--primary-color);
    font-size: 1.65rem;
    line-height: 1.45;
    letter-spacing: 0.03em;
}
.case-finder-panel p {
    margin: 0;
    color: #405166;
    font-size: 0.98rem;
    line-height: 1.9;
}
.case-finder-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 22px;
}
.case-finder-tags span {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0 15px;
    border: 1px solid #cfd9e4;
    border-radius: 999px;
    background: #fff;
    color: #33445d;
    font-size: 0.86rem;
    font-weight: 600;
}
.case-finder-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 190px;
    padding: 15px 22px;
    border-radius: 6px;
    background: var(--primary-color);
    color: #fff;
    font-weight: 700;
    box-shadow: 0 8px 18px rgba(26, 43, 75, 0.16);
}
.case-finder-button:hover {
    background: #233b66;
    transform: translateY(-1px);
}
.homepage-flow-section {
    padding: 0 20px 96px;
    background: #fff;
}
.homepage-flow-inner {
    max-width: 1000px;
    margin: 0 auto;
}
.homepage-flow-heading {
    margin: 0 0 16px;
    text-align: center;
    color: var(--primary-color);
    font-size: 2rem;
    line-height: 1.45;
    letter-spacing: 0.04em;
}
.homepage-flow-lead {
    max-width: 720px;
    margin: 0 auto 36px;
    text-align: center;
    color: #405166;
    font-size: 0.98rem;
    line-height: 1.9;
}
.homepage-flow-steps {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 12px;
    list-style: none;
    padding: 0;
    margin: 0;
}
.homepage-flow-step {
    min-height: 118px;
    box-sizing: border-box;
    padding: 20px 12px;
    border: 1px solid #dce5ee;
    border-radius: 8px;
    background: #fff;
    text-align: center;
    box-shadow: 0 8px 20px rgba(26, 43, 75, 0.035);
}
.homepage-flow-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    margin-bottom: 14px;
    border: 1px solid #cfd9e4;
    border-radius: 50%;
    color: #1a2b4b;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.03em;
}
.homepage-flow-label {
    display: block;
    color: var(--primary-color);
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.55;
}
.consultation-safe-section {
    padding: 0 20px 96px;
    background: #fff;
}
.consultation-safe-panel {
    max-width: 1000px;
    margin: 0 auto;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 28px 44px;
    align-items: center;
    padding: 38px 44px;
    border: 1px solid #dce5ee;
    border-radius: 10px;
    background: #f8fafc;
    box-shadow: 0 10px 24px rgba(26, 43, 75, 0.04);
}
.consultation-safe-copy {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 22px;
    align-items: start;
}
.consultation-safe-mark {
    width: 56px;
    height: 56px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #cfd9e4;
    border-radius: 50%;
    color: var(--primary-color);
    font-size: 1.55rem;
    line-height: 1;
    background: #fff;
}
.consultation-safe-panel h2 {
    margin: 0 0 16px;
    color: var(--primary-color);
    font-size: 1.55rem;
    line-height: 1.45;
    letter-spacing: 0.03em;
}
.consultation-safe-panel p {
    margin: 0;
    color: #405166;
    font-size: 0.96rem;
    line-height: 1.9;
}
.consultation-safe-panel p + p {
    margin-top: 12px;
}
.consultation-safe-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 220px;
    padding: 14px 20px;
    border: 1px solid #1a2b4b;
    border-radius: 6px;
    background: #fff;
    color: var(--primary-color);
    font-weight: 700;
}
.consultation-safe-button:hover {
    background: #f1f5f9;
    transform: translateY(-1px);
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
.faq-list { max-width: 860px; margin: 0 auto; display: grid; gap: 14px; }
.faq-item {
    background-color: var(--white);
    border: 1px solid #dce5ee;
    border-radius: 8px;
    padding: 24px 26px;
    box-shadow: 0 8px 20px rgba(26, 43, 75, 0.035);
}
.faq-question {
    margin: 0 0 12px;
    color: var(--primary-color);
    font-size: 1.02rem;
    font-weight: 700;
    line-height: 1.65;
}
.faq-answer {
    margin: 0;
    color: #405166;
    font-size: 0.95rem;
    line-height: 1.9;
}

/* お問い合わせ */
.business-guide-section {
    padding: 0 20px 90px;
    background: #fff;
}
.business-guide-panel {
    max-width: 1000px;
    margin: 0 auto;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 26px 42px;
    align-items: center;
    padding: 34px 42px;
    border: 1px solid #dce5ee;
    border-radius: 10px;
    background: #f8fafc;
    box-shadow: 0 10px 24px rgba(26, 43, 75, 0.04);
}
.business-guide-panel h2 {
    margin: 0 0 14px;
    color: var(--primary-color);
    font-size: 1.5rem;
    line-height: 1.45;
    letter-spacing: 0.03em;
}
.business-guide-panel p {
    margin: 0;
    color: #405166;
    font-size: 0.96rem;
    line-height: 1.9;
}
.business-guide-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 220px;
    padding: 14px 20px;
    border-radius: 6px;
    background: var(--primary-color);
    color: #fff;
    font-weight: 700;
    box-shadow: 0 8px 18px rgba(26, 43, 75, 0.14);
}
.business-guide-button:hover {
    background: #233b66;
    transform: translateY(-1px);
}

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
    .strength-card-grid { grid-template-columns: 1fr; }
    .strength-card { min-height: auto; }
    .case-finder-section { padding: 0 20px 60px; }
    .case-finder-panel {
        grid-template-columns: 1fr;
        padding: 28px 22px;
    }
    .case-finder-panel h2 { font-size: 1.35rem; }
    .case-finder-button { width: 100%; box-sizing: border-box; }
    .homepage-flow-section { padding: 0 20px 60px; }
    .homepage-flow-heading { font-size: 1.6rem; }
    .homepage-flow-lead {
        margin-bottom: 28px;
        text-align: left;
    }
    .homepage-flow-steps { grid-template-columns: 1fr; gap: 10px; }
    .homepage-flow-step {
        min-height: auto;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px 18px;
        text-align: left;
    }
    .homepage-flow-number {
        flex: 0 0 auto;
        margin: 0;
    }
    .consultation-safe-section { padding: 0 20px 60px; }
    .consultation-safe-panel {
        grid-template-columns: 1fr;
        padding: 28px 22px;
    }
    .consultation-safe-copy {
        grid-template-columns: 1fr;
        gap: 16px;
    }
    .consultation-safe-mark {
        width: 48px;
        height: 48px;
        font-size: 1.35rem;
    }
    .consultation-safe-panel h2 { font-size: 1.35rem; }
    .consultation-safe-button { width: 100%; box-sizing: border-box; }
    .business-guide-section { padding: 0 20px 60px; }
    .business-guide-panel {
        grid-template-columns: 1fr;
        padding: 28px 22px;
    }
    .business-guide-panel h2 { font-size: 1.35rem; }
    .business-guide-button { width: 100%; box-sizing: border-box; }
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
        <h2 class="section-title">&#20462;&#29702;&#12395;&#12388;&#12356;&#12390;</h2>
        <div class="strength-card-grid">
            <a class="strength-card" href="https://lin.ee/3C0XfJW">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z"/></svg>
                <h3>LINE&#12391;&#27010;&#31639;&#30456;&#35527;</h3>
                <p>&#20889;&#30495;&#12539;&#22411;&#30058;&#12539;&#30151;&#29366;&#12434;LINE&#12391;&#30906;&#35469;&#12375;&#12394;&#12364;&#12425;&#12289;&#21463;&#20184;&#21069;&#12395;&#12391;&#12365;&#12427;&#38480;&#12426;&#29694;&#23455;&#12395;&#36817;&#12356;&#27010;&#31639;&#12434;&#12372;&#26696;&#20869;&#12375;&#12414;&#12377;&#12290;</p>
            </a>
            <a class="strength-card" href="/cases/gallery">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7.5"/><path d="m20 20-3.6-3.6"/></svg>
                <h3>&#20462;&#29702;&#20107;&#20363;&#12434;&#25506;&#12377;</h3>
                <p>&#12502;&#12521;&#12531;&#12489;&#12539;&#22411;&#30058;&#12539;&#30151;&#29366;&#12539;&#20462;&#29702;&#20869;&#23481;&#12363;&#12425;&#12289;&#20284;&#12383;&#20462;&#29702;&#20107;&#20363;&#12434;&#30906;&#35469;&#12391;&#12365;&#12414;&#12377;&#12290;</p>
            </a>
            <div class="strength-card strength-card-static">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
                <h3>&#25216;&#34899;&#32773;&#12395;&#12388;&#12356;&#12390;</h3>
                <p>&#20462;&#29702;&#27508;20&#24180;&#12290;&#22269;&#20869;&#26178;&#35336;&#12513;&#12540;&#12459;&#12540;&#12398;&#20462;&#29702;&#29694;&#22580;&#12391;&#22521;&#12387;&#12383;&#32076;&#39443;&#12434;&#12418;&#12392;&#12395;&#12289;&#24517;&#35201;&#12394;&#24037;&#31243;&#12434;&#30465;&#30053;&#12375;&#12394;&#12356;&#20462;&#29702;&#12434;&#24515;&#12364;&#12369;&#12390;&#12356;&#12414;&#12377;&#12290;</p>
            </div>
            <div class="strength-card strength-card-static">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="m7.5 4.3 9 5.1"/><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                <h3>&#37096;&#21697;&#35519;&#36948;</h3>
                <p>&#22269;&#20869;&#22806;&#12398;&#20181;&#20837;&#12428;&#20808;&#12363;&#12425;&#12289;&#32020;&#27491;&#37096;&#21697;&#12420;&#36969;&#21512;&#37096;&#21697;&#12434;&#25506;&#12375;&#12414;&#12377;&#12290;</p>
            </div>
            <div class="strength-card strength-card-static">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a6 6 0 0 1-7.8 7.8l-7.4 7.4a2.1 2.1 0 0 1-3-3l7.4-7.4a6 6 0 0 1 7.8-7.8Z"/></svg>
                <h3>&#21152;&#24037;&#12539;&#35069;&#20316;</h3>
                <p>&#20837;&#25163;&#22256;&#38627;&#12394;&#37096;&#21697;&#12399;&#12289;&#21152;&#24037;&#12420;&#35069;&#20316;&#12418;&#21547;&#12417;&#12390;&#23550;&#24540;&#26041;&#27861;&#12434;&#26908;&#35342;&#12375;&#12414;&#12377;&#12290;</p>
            </div>
            <div class="strength-card strength-card-static">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 22a7 7 0 0 0 7-7c0-4.2-4.5-9.1-6.2-10.9a1.1 1.1 0 0 0-1.6 0C9.5 5.9 5 10.8 5 15a7 7 0 0 0 7 7Z"/></svg>
                <h3>&#38450;&#27700;&#30906;&#35469;</h3>
                <p>&#12458;&#12540;&#12496;&#12540;&#12507;&#12540;&#12523;&#24460;&#12399;&#20840;&#25968;&#38450;&#27700;&#26908;&#26619;&#12290;&#35023;&#33995;&#12539;&#12522;&#12517;&#12540;&#12474;&#12539;&#12503;&#12483;&#12471;&#12515;&#12540;&#12539;&#12460;&#12521;&#12473;&#12414;&#12431;&#12426;&#12398;&#12497;&#12483;&#12461;&#12531;&#12414;&#12391;&#30906;&#35469;&#12375;&#12414;&#12377;&#12290;</p>
            </div>
        </div>
    </div>
</section>

<section class="case-finder-section">
    <div class="case-finder-panel">
        <div>
            <h2>&#33258;&#20998;&#12398;&#26178;&#35336;&#12395;&#36817;&#12356;&#20462;&#29702;&#20107;&#20363;&#12434;&#25506;&#12377;</h2>
            <p>&#12502;&#12521;&#12531;&#12489;&#12539;&#22411;&#30058;&#12539;&#30151;&#29366;&#12539;&#20462;&#29702;&#20869;&#23481;&#12363;&#12425;&#12289;&#20284;&#12383;&#20462;&#29702;&#20107;&#20363;&#12434;&#30906;&#35469;&#12391;&#12365;&#12414;&#12377;&#12290;<br>&#12300;&#12371;&#12398;&#26178;&#35336;&#12418;&#30452;&#12379;&#12427;&#12363;&#12301;&#12434;&#30693;&#12426;&#12383;&#12356;&#26041;&#12399;&#12289;&#12414;&#12378;&#36942;&#21435;&#12398;&#20107;&#20363;&#12434;&#12372;&#35239;&#12367;&#12384;&#12373;&#12356;&#12290;</p>
            <div class="case-finder-tags" aria-label="&#26908;&#32034;&#12391;&#20351;&#12360;&#12427;&#38917;&#30446;">
                <span>&#12502;&#12521;&#12531;&#12489;</span>
                <span>&#22411;&#30058;</span>
                <span>&#12514;&#12487;&#12523;</span>
                <span>Cal</span>
                <span>&#30151;&#29366;</span>
                <span>&#20462;&#29702;&#20869;&#23481;</span>
                <span>&#20132;&#25563;&#37096;&#21697;</span>
            </div>
        </div>
        <a class="case-finder-button" href="/cases/gallery">&#20462;&#29702;&#20107;&#20363;&#12434;&#26908;&#32034;&#12377;&#12427;</a>
    </div>
</section>

<section class="homepage-flow-section">
    <div class="homepage-flow-inner">
        <h2 class="homepage-flow-heading">修理の流れ</h2>
        <p class="homepage-flow-lead">LINEでのご相談から、正式見積り、修理、精度・防水確認、納品までの流れをご確認いただけます。</p>
        <ol class="homepage-flow-steps">
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">01</span>
                <span class="homepage-flow-label">LINE相談</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">02</span>
                <span class="homepage-flow-label">概算案内</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">03</span>
                <span class="homepage-flow-label">受付</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">04</span>
                <span class="homepage-flow-label">正式見積り</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">05</span>
                <span class="homepage-flow-label">修理</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">06</span>
                <span class="homepage-flow-label">精度・防水確認</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">07</span>
                <span class="homepage-flow-label">納品</span>
            </li>
        </ol>
    </div>
</section>

<section class="consultation-safe-section">
    <div class="consultation-safe-panel">
        <div class="consultation-safe-copy">
            <span class="consultation-safe-mark" aria-hidden="true">&#10003;</span>
            <div>
                <h2>&#23433;&#24515;&#12375;&#12390;&#12372;&#30456;&#35527;&#12356;&#12383;&#12384;&#12367;&#12383;&#12417;&#12395;</h2>
                <p>&#12372;&#30456;&#35527;&#12384;&#12369;&#12391;&#20462;&#29702;&#21463;&#20184;&#12395;&#12399;&#12394;&#12426;&#12414;&#12379;&#12435;&#12290;<br>LINE&#12391;&#20889;&#30495;&#12539;&#22411;&#30058;&#12539;&#30151;&#29366;&#12434;&#30906;&#35469;&#12375;&#12289;&#21463;&#20184;&#21069;&#12395;&#12391;&#12365;&#12427;&#38480;&#12426;&#29694;&#23455;&#12395;&#36817;&#12356;&#27010;&#31639;&#12434;&#12372;&#26696;&#20869;&#12375;&#12414;&#12377;&#12290;</p>
                <p>&#27491;&#24335;&#12394;&#20316;&#26989;&#12399;&#12289;&#20869;&#23481;&#12392;&#37329;&#38989;&#12434;&#12372;&#30906;&#35469;&#12356;&#12383;&#12384;&#12356;&#12390;&#12363;&#12425;&#36914;&#12417;&#12414;&#12377;&#12290;<br>&#20195;&#26367;&#37096;&#21697;&#12398;&#20351;&#29992;&#12420;&#36861;&#21152;&#20316;&#26989;&#12364;&#24517;&#35201;&#12394;&#22580;&#21512;&#12418;&#12289;&#20107;&#21069;&#12395;&#12372;&#35500;&#26126;&#12375;&#12414;&#12377;&#12290;</p>
            </div>
        </div>
        <a class="consultation-safe-button" href="#contact">&#30456;&#35527;&#21069;&#12395;&#30906;&#35469;&#12375;&#12383;&#12356;&#12371;&#12392;&#12434;&#35211;&#12427;</a>
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
        <h2 class="section-title">&#12424;&#12367;&#12354;&#12427;&#36074;&#21839;</h2>
        <div class="faq-list">
            <div class="faq-item">
                <h3 class="faq-question">&#30456;&#35527;&#12384;&#12369;&#12391;&#12418;&#22823;&#19976;&#22827;&#12391;&#12377;&#12363;&#65311;</h3>
                <p class="faq-answer">&#12399;&#12356;&#12290;&#12372;&#30456;&#35527;&#12384;&#12369;&#12391;&#20462;&#29702;&#21463;&#20184;&#12395;&#12399;&#12394;&#12426;&#12414;&#12379;&#12435;&#12290;&#20889;&#30495;&#12539;&#22411;&#30058;&#12539;&#30151;&#29366;&#12434;&#30906;&#35469;&#12375;&#12289;&#21463;&#20184;&#21069;&#12395;&#12391;&#12365;&#12427;&#38480;&#12426;&#29694;&#23455;&#12395;&#36817;&#12356;&#27010;&#31639;&#12434;&#12372;&#26696;&#20869;&#12375;&#12414;&#12377;&#12290;</p>
            </div>
            <div class="faq-item">
                <h3 class="faq-question">&#21463;&#20184;&#21069;&#12395;&#27010;&#31639;&#12399;&#20998;&#12363;&#12426;&#12414;&#12377;&#12363;&#65311;</h3>
                <p class="faq-answer">LINE&#12391;&#20889;&#30495;&#12420;&#30151;&#29366;&#12434;&#30906;&#35469;&#12375;&#12383;&#12358;&#12360;&#12391;&#12289;&#21487;&#33021;&#12394;&#31684;&#22258;&#12391;&#27010;&#31639;&#12434;&#12372;&#26696;&#20869;&#12375;&#12414;&#12377;&#12290;&#12383;&#12384;&#12375;&#12289;&#27491;&#24335;&#12394;&#37329;&#38989;&#12399;&#23455;&#29289;&#30906;&#35469;&#24460;&#12398;&#12362;&#35211;&#31309;&#12426;&#12392;&#12394;&#12426;&#12414;&#12377;&#12290;</p>
            </div>
            <div class="faq-item">
                <h3 class="faq-question">&#32020;&#27491;&#37096;&#21697;&#12391;&#20462;&#29702;&#12391;&#12365;&#12414;&#12377;&#12363;&#65311;</h3>
                <p class="faq-answer">&#20837;&#25163;&#21487;&#33021;&#12394;&#22580;&#21512;&#12399;&#32020;&#27491;&#37096;&#21697;&#12391;&#12398;&#23550;&#24540;&#12434;&#26908;&#35342;&#12375;&#12414;&#12377;&#12290;&#32020;&#27491;&#37096;&#21697;&#12364;&#20837;&#25163;&#22256;&#38627;&#12394;&#22580;&#21512;&#12399;&#12289;&#36969;&#21512;&#37096;&#21697;&#12420;&#21152;&#24037;&#12539;&#35069;&#20316;&#12434;&#21547;&#12417;&#12390;&#23550;&#24540;&#26041;&#27861;&#12434;&#12372;&#35500;&#26126;&#12375;&#12414;&#12377;&#12290;</p>
            </div>
            <div class="faq-item">
                <h3 class="faq-question">&#38450;&#27700;&#26908;&#26619;&#12399;&#12375;&#12390;&#12356;&#12414;&#12377;&#12363;&#65311;</h3>
                <p class="faq-answer">&#12458;&#12540;&#12496;&#12540;&#12507;&#12540;&#12523;&#24460;&#12399;&#38450;&#27700;&#26908;&#26619;&#12434;&#34892;&#12356;&#12414;&#12377;&#12290;&#35023;&#33995;&#12539;&#12522;&#12517;&#12540;&#12474;&#12539;&#12503;&#12483;&#12471;&#12515;&#12540;&#12539;&#12460;&#12521;&#12473;&#12414;&#12431;&#12426;&#12398;&#12497;&#12483;&#12461;&#12531;&#12418;&#30906;&#35469;&#12375;&#12414;&#12377;&#12290;</p>
            </div>
            <div class="faq-item">
                <h3 class="faq-question">&#20182;&#24215;&#12391;&#26029;&#12425;&#12428;&#12383;&#26178;&#35336;&#12391;&#12418;&#30456;&#35527;&#12391;&#12365;&#12414;&#12377;&#12363;&#65311;</h3>
                <p class="faq-answer">&#29366;&#24907;&#12420;&#37096;&#21697;&#20837;&#25163;&#29366;&#27841;&#12395;&#12424;&#12426;&#12414;&#12377;&#12364;&#12289;&#37096;&#21697;&#35519;&#36948;&#12539;&#21152;&#24037;&#12539;&#35069;&#20316;&#12418;&#21547;&#12417;&#12390;&#20462;&#29702;&#12398;&#21487;&#33021;&#24615;&#12434;&#30906;&#35469;&#12375;&#12414;&#12377;&#12290;&#12414;&#12378;&#12399;&#20889;&#30495;&#12392;&#30151;&#29366;&#12434;&#12362;&#36865;&#12426;&#12367;&#12384;&#12373;&#12356;&#12290;</p>
            </div>
        </div>
    </div>
</section>

<section class="business-guide-section">
    <div class="business-guide-panel">
        <div>
            <h2>&#26989;&#32773;&#27096;&#12408;</h2>
            <p>&#21462;&#24341;&#20808;&#27096;&#21521;&#12369;&#12395;&#12289;&#23455;&#21209;&#21028;&#26029;&#12395;&#24441;&#31435;&#12388;&#20462;&#29702;&#20107;&#20363;&#12434;&#12372;&#29992;&#24847;&#12375;&#12390;&#12356;&#12414;&#12377;&#12290;<br>&#12502;&#12521;&#12531;&#12489;&#12539;&#22411;&#30058;&#12539;Cal&#12539;&#20462;&#29702;&#20869;&#23481;&#12539;&#20132;&#25563;&#37096;&#21697;&#12289;&#36027;&#29992;&#24863;&#12394;&#12393;&#12434;&#30906;&#35469;&#12375;&#12289;<br>&#26178;&#35336;&#12434;&#36865;&#12427;&#21069;&#12398;&#21028;&#26029;&#26448;&#26009;&#12392;&#12375;&#12390;&#12372;&#21033;&#29992;&#12356;&#12383;&#12384;&#12369;&#12414;&#12377;&#12290;</p>
        </div>
        <a class="business-guide-button" href="/cases/biz">&#26989;&#32773;&#27096;&#21521;&#12369;&#12506;&#12540;&#12472;&#12434;&#35211;&#12427;</a>
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
