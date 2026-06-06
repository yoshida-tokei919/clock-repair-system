import Link from "next/link";
import {
    getLatestB2CPublicCasesForHome,
    type B2CPublicCaseForGallery,
} from "@/lib/public-cases";
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

nav ul { list-style: none; display: flex; gap: 18px; padding: 0; margin: 0;}
nav a { color: var(--text-color); font-size: 0.9rem; font-weight: 500; }
nav a:hover { color: var(--accent-color); }
.header-line-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 13px;
    border-radius: 6px;
    background: #06C755;
    color: #fff !important;
    font-weight: 700;
    box-shadow: 0 6px 14px rgba(6, 199, 85, 0.18);
}
.header-line-link:hover {
    background: #05B84F;
    color: #fff !important;
    transform: translateY(-1px);
}
.header-line-icon {
    width: 24px;
    height: 24px;
    display: inline-block;
    flex: 0 0 auto;
}
.header-line-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.08;
}
.header-line-text-small {
    font-size: 0.72rem;
    font-weight: 700;
}
.header-line-text-main {
    font-size: 0.84rem;
    font-weight: 800;
}

/* トップページ（背景画像ヒーロー） */
.hero {
    position: relative;
    margin-top: 101px;
    overflow: hidden;
    min-height: 680px;
    display: flex;
    align-items: center;
    background-color: #101827;
    background-position: center;
    background-size: cover;
    color: #ffffff;
}
.hero-inner {
    max-width: 1180px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
    padding: 104px 24px 94px;
    text-align: left;
}
.hero-eyebrow {
    margin: 0 0 18px;
    color: rgba(255, 255, 255, 0.88);
    font-size: clamp(1.25rem, 2vw, 1.45rem);
    font-weight: 700;
    letter-spacing: 0.08em;
}
.hero-title {
    margin: 0;
    color: #ffffff;
    font-size: clamp(2.7rem, 5vw, 4.5rem);
    line-height: 1.18;
    font-weight: 600;
    letter-spacing: 0;
    text-shadow: 0 3px 18px rgba(0, 0, 0, 0.36);
}
.hero-title-line {
    display: block;
}
.hero-lead {
    max-width: 760px;
    margin: 26px 0 0;
    color: rgba(255, 255, 255, 0.9);
    font-size: 1rem;
    line-height: 2;
    font-weight: 500;
    text-shadow: 0 2px 14px rgba(0, 0, 0, 0.32);
}
.hero-actions {
    display: flex;
    justify-content: flex-start;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-width: 190px;
    padding: 15px 26px;
    border-radius: 7px;
    border: 1px solid transparent;
    font-size: 0.98rem;
    box-shadow: none;
}
.hero-case-btn {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.68) !important;
    backdrop-filter: blur(4px);
}
.hero-case-btn:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #ffffff;
}
@media (prefers-reduced-motion: reduce) {
    .recent-cases-track-inner {
        animation: none !important;
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
    position: relative;
    overflow: hidden;
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.92)),
        url("/img/dial-hands.jpg") center 44% / cover no-repeat;
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
    background: rgba(255, 255, 255, 0.96);
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
.strength-card-more {
    display: inline-block;
    margin-top: 18px;
    color: var(--primary-color);
    font-size: 0.86rem;
    font-weight: 700;
    letter-spacing: 0.03em;
}
.strength-card-static:hover {
    transform: none;
    border-color: #dce5ee;
    box-shadow: 0 8px 22px rgba(26, 43, 75, 0.04);
}

.recent-cases-section {
    padding: 0 20px 88px;
    background: #fff;
}
.recent-cases-inner {
    max-width: 1120px;
    margin: 0 auto;
}
.recent-cases-heading {
    margin: 0 0 14px;
    color: var(--primary-color);
    font-size: 2rem;
    line-height: 1.45;
    letter-spacing: 0.04em;
    text-align: center;
}
.recent-cases-lead {
    max-width: 720px;
    margin: 0 auto 34px;
    color: #405166;
    font-size: 0.98rem;
    line-height: 1.9;
    text-align: center;
}
.recent-cases-track {
    display: flex;
    gap: 18px;
    overflow-x: auto;
    padding: 4px 2px 18px;
    scroll-snap-type: x mandatory;
    scrollbar-width: thin;
    scrollbar-color: #c8d4e1 transparent;
}
.recent-cases-track-inner {
    display: flex;
    width: max-content;
    animation: recentCasesSlide 42s linear infinite;
}
.recent-cases-track:hover .recent-cases-track-inner {
    animation-play-state: paused;
}
.recent-cases-set {
    display: flex;
    flex: 0 0 auto;
    gap: 18px;
    padding-right: 18px;
}
.recent-case-card {
    flex: 0 0 min(275px, 82vw);
    overflow: hidden;
    border: 1px solid #dce5ee;
    border-radius: 10px;
    background: #fff;
    color: var(--primary-color);
    text-decoration: none;
    box-shadow: 0 10px 24px rgba(26, 43, 75, 0.045);
    scroll-snap-align: start;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.recent-case-card:hover {
    transform: translateY(-2px);
    border-color: #b8c5d4;
    box-shadow: 0 14px 30px rgba(26, 43, 75, 0.08);
}
.recent-case-image {
    width: 100%;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    background: #eef2f6;
}
.recent-case-image img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
}
.recent-case-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #eef2f6, #e5e7eb);
}
.recent-case-body {
    padding: 20px 20px 22px;
}
.recent-case-brand {
    margin: 0 0 6px;
    color: #53657b;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.12em;
}
.recent-case-model {
    margin: 0;
    color: var(--primary-color);
    font-size: 1.15rem;
    line-height: 1.45;
}
.recent-case-meta {
    margin: 7px 0 0;
    color: #53657b;
    font-size: 0.84rem;
    font-weight: 600;
    line-height: 1.55;
}
.recent-case-repair {
    margin: 12px 0 18px;
    color: #405166;
    font-size: 0.92rem;
    line-height: 1.7;
}
.recent-case-more {
    color: var(--primary-color);
    font-size: 0.9rem;
    font-weight: 700;
}
.recent-cases-action {
    margin-top: 22px;
    text-align: center;
}
.recent-cases-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 210px;
    padding: 13px 22px;
    border: 1px solid #1a2b4b;
    border-radius: 6px;
    background: var(--primary-color);
    color: #fff;
    font-weight: 700;
}
.recent-cases-button:hover {
    background: #233b66;
    transform: translateY(-1px);
}
@keyframes recentCasesSlide {
    from {
        transform: translateX(0);
    }
    to {
        transform: translateX(-50%);
    }
}

.homepage-flow-section {
    position: relative;
    padding: 0 20px 96px;
    overflow: hidden;
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.87), rgba(247, 250, 253, 0.91)),
        url("/img/parts-tray.jpg") center 48% / cover no-repeat;
}
.homepage-flow-inner {
    position: relative;
    z-index: 1;
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    list-style: none;
    padding: 0;
    margin: 0;
}
.homepage-flow-step {
    min-height: 132px;
    box-sizing: border-box;
    padding: 18px 14px;
    border: 1px solid #dce5ee;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.94);
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
.homepage-flow-note {
    display: block;
    margin-top: 8px;
    color: #53657b;
    font-size: 0.82rem;
    font-weight: 500;
    line-height: 1.6;
}
.homepage-flow-detail {
    margin-top: 28px;
    text-align: center;
}
.homepage-flow-detail-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 190px;
    padding: 13px 22px;
    border: 1px solid #b8c5d4;
    border-radius: 6px;
    color: var(--primary-color);
    font-weight: 700;
    background: #fff;
}
.homepage-flow-detail-link:hover {
    background: #f8fafc;
    border-color: #8fa1b7;
    transform: translateY(-1px);
}
/* 流れ・保証・FAQ */
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
.faq-detail-link {
    display: inline-block;
    margin-top: 10px;
    color: var(--primary-color);
    font-size: 0.9rem;
    font-weight: 700;
}
.faq-detail-link:hover {
    color: #233b66;
    text-decoration: underline;
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

/* フッター */
footer { background-color: #15213a; color: rgba(255,255,255,0.6); padding: 60px 20px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);}
.footer-logo-img { height: 35px; width: auto; margin-bottom: 15px; opacity: 0.8;} 
.footer-name { font-size: 1.2rem; color: var(--white); margin-bottom: 20px;}
.copyright { font-size: 0.85rem;}

/* レスポンシブ対応 */
@media (max-width: 768px) {
    header { padding: 6px 0; }
    .nav-container { flex-direction: column; align-items: flex-start; padding: 8px 14px 6px; }
    .logo-wrapper { gap: 10px; }
    .logo-img { height: 44px; }
    .site-name { font-size: 1rem; }
    nav {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
    }
    nav::-webkit-scrollbar { display: none; }
    nav ul {
        flex-wrap: nowrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 8px;
        width: 100%;
    }
    nav li { flex: 0 0 auto; }
    nav a { white-space: nowrap; font-size: 0.82rem; }
    .header-line-link {
        padding: 6px 9px;
        gap: 6px;
    }
    .header-line-icon {
        width: 22px;
        height: 22px;
    }
    .header-line-text-small {
        font-size: 0.68rem;
    }
    .header-line-text-main {
        font-size: 0.78rem;
    }
    .hero {
        min-height: 560px;
        margin-top: 116px;
        background-position: center;
    }
    .hero-inner { padding: 64px 20px 58px; }
    .hero-title { font-size: 2.35rem; }
    .hero-lead { font-size: 0.95rem; line-height: 1.9; }
    .hero-actions { flex-direction: column; align-items: stretch; }
    .hero .btn { width: 100%; box-sizing: border-box; }
    .section { padding: 60px 20px; }
    .strengths-section {
        padding: 44px 12px 42px;
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(248, 250, 252, 0.94)),
            url("/img/dial-hands.jpg") center 45% / cover no-repeat;
    }
    .strengths-section .section-title {
        margin-bottom: 34px;
    }
    .strengths-section .section-title::after {
        margin-top: 16px;
    }
    .strength-card-grid { grid-template-columns: 1fr; gap: 12px; }
    .strength-card {
        min-height: auto;
        padding: 22px 22px;
    }
    .strength-card-mark {
        margin-bottom: 14px;
    }
    .strength-card h3 {
        margin-bottom: 10px;
    }
    .strength-card-more {
        margin-top: 14px;
    }
    .recent-cases-section { padding: 0 20px 60px; }
    .recent-cases-heading { font-size: 1.6rem; }
    .recent-cases-lead {
        margin-bottom: 26px;
        text-align: left;
    }
    .recent-cases-track {
        margin-right: -20px;
        padding-right: 20px;
    }
    .recent-cases-button { width: 100%; box-sizing: border-box; }
    .homepage-flow-section {
        padding: 0 20px 60px;
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(247, 250, 253, 0.94)),
            url("/img/parts-tray.jpg") center 50% / cover no-repeat;
    }
    .homepage-flow-heading { font-size: 1.6rem; }
    .homepage-flow-lead {
        margin-bottom: 28px;
        text-align: left;
    }
    .homepage-flow-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .homepage-flow-step {
        min-height: auto;
        padding: 16px 12px;
        text-align: center;
    }
    .homepage-flow-number {
        margin-bottom: 10px;
    }
    .homepage-flow-label {
        font-size: 0.9rem;
    }
    .homepage-flow-note {
        margin-top: 6px;
        font-size: 0.78rem;
        line-height: 1.55;
    }
    .homepage-flow-detail-link { width: 100%; box-sizing: border-box; }
    .business-guide-section { padding: 0 20px 60px; }
    .business-guide-panel {
        grid-template-columns: 1fr;
        padding: 28px 22px;
    }
    .business-guide-panel h2 { font-size: 1.35rem; }
    .business-guide-button { width: 100%; box-sizing: border-box; }
}
@media (max-width: 480px) {
    .hero-title {
        font-size: clamp(1.9rem, 8vw, 2.15rem);
        line-height: 1.28;
    }
    .hero-title-line { white-space: nowrap; }
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
                <li><a href="#flow">修理の流れ</a></li>
                <li><a href="https://lin.ee/3C0XfJW" class="header-line-link"><img src="/img/line-brand-icon.png" alt="" aria-hidden="true" class="header-line-icon"><span class="header-line-text"><span class="header-line-text-small">LINEで相談</span><span class="header-line-text-main">簡単見積り</span></span></a></li>
                <li><a href="/cases/biz" style="color:#b59410; font-weight:bold; border:1px solid #b59410; padding:5px 10px; border-radius:4px;">業者様はこちら</a></li>
            </ul>
        </nav>
    </div>
</header>
`;

type HomeRecentCase = {
    id: number;
    brand: string;
    model: string;
    meta: string;
    repair: string;
    image?: string;
    alt: string;
    href: string;
};

function text(value?: string | null): string {
    return (value ?? "").trim();
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getBrandDisplayName(publicCase: B2CPublicCaseForGallery): string {
    return text(publicCase.brandDisplayName) || text(publicCase.brandName);
}

function getWorkDisplayName(publicCase: B2CPublicCaseForGallery): string {
    const work = publicCase.workItems
        .filter((workItem) => workItem.isPublishable)
        .map((workItem) => text(workItem.b2cDisplayName) || text(workItem.b2bDisplayName))
        .find(Boolean);

    return work || "修理内容確認中";
}

function getCaseTitle(publicCase: B2CPublicCaseForGallery, workName: string): string {
    return (
        text(publicCase.modelName) ||
        (text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "") ||
        (text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "") ||
        workName ||
        "修理事例"
    );
}

function getCaseMeta(publicCase: B2CPublicCaseForGallery): string {
    return [
        text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "",
        text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "",
    ]
        .filter(Boolean)
        .join(" / ");
}

function toHomeRecentCase(publicCase: B2CPublicCaseForGallery): HomeRecentCase {
    const repair = getWorkDisplayName(publicCase);
    const brand = getBrandDisplayName(publicCase);
    const model = getCaseTitle(publicCase, repair);
    const image = text(publicCase.images[0]?.url);

    return {
        id: publicCase.id,
        brand,
        model,
        meta: getCaseMeta(publicCase),
        repair,
        image: image || undefined,
        alt: `${brand ? `${brand} ` : ""}${model}`,
        href: `/cases/gallery/${publicCase.id}`,
    };
}

function buildAboutPriceHtml(recentRepairCases: HomeRecentCase[]): string {
    return `
<section id="about" class="section strengths-section">
    <div class="container">
        <h2 class="section-title">ヨシダ時計修理工房の強み</h2>
        <div class="strength-card-grid">
            <a class="strength-card" href="/line-consultation">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z"/></svg>
                <h3>LINEで概算相談</h3>
                <p>時計の写真や分かる範囲の情報から、受付前に費用感をご案内します。</p>
                <span class="strength-card-more">詳しく見る →</span>
            </a>
            <a class="strength-card" href="/difficult-repair">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a6 6 0 0 1-7.8 7.8l-7.4 7.4a2.1 2.1 0 0 1-3-3l7.4-7.4a6 6 0 0 1 7.8-7.8Z"/></svg>
                <h3>断られた時計もご相談ください</h3>
                <p>部品入手が難しい時計や、他店で断られた修理も、できる方法を検討します。</p>
                <span class="strength-card-more">詳しく見る →</span>
            </a>
            <a class="strength-card" href="/about-technician">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
                <h3>当工房の技術者</h3>
                <p>1級時計修理技能士が、状態に合わせて必要な作業を見極めます。</p>
                <span class="strength-card-more">詳しく見る →</span>
            </a>
            <a class="strength-card" href="/parts-sourcing">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="m7.5 4.3 9 5.1"/><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                <h3>部品調達のネットワーク</h3>
                <p>純正部品を基本に、入手困難な場合も複数の調達先や代替案を検討します。</p>
                <span class="strength-card-more">詳しく見る →</span>
            </a>
            <a class="strength-card" href="/waterproof-check">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 22a7 7 0 0 0 7-7c0-4.2-4.5-9.1-6.2-10.9a1.1 1.1 0 0 0-1.6 0C9.5 5.9 5 10.8 5 15a7 7 0 0 0 7 7Z"/></svg>
                <h3>防水性を大切にする修理</h3>
                <p>パッキン交換や防水確認まで、使用環境に合わせて慎重に判断します。</p>
                <span class="strength-card-more">詳しく見る →</span>
            </a>
            <a class="strength-card" href="/price-quality">
                <svg class="strength-card-mark" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/><path d="M4 20h16"/></svg>
                <h3>価格と修理品質</h3>
                <p>必要な工程を見極め、費用と仕上がりのバランスを考えます。</p>
                <span class="strength-card-more">詳しく見る →</span>
            </a>
        </div>
    </div>
</section>

<section class="recent-cases-section" aria-labelledby="recent-cases-heading">
    <div class="recent-cases-inner">
        <h2 id="recent-cases-heading" class="recent-cases-heading">修理事例を探す</h2>
        <p class="recent-cases-lead">ブランドや症状から修理事例をご覧いただけます。</p>
        <div class="recent-cases-track" aria-label="最近の修理事例">
            <div class="recent-cases-track-inner">
            ${[0, 1]
                .map(
                    () => `
                <div class="recent-cases-set">
                ${recentRepairCases
                    .map(
                        (repairCase) => `
            <a class="recent-case-card" href="${escapeHtml(repairCase.href)}">
                <div class="recent-case-image">
                    ${repairCase.image
                        ? `<img src="${escapeHtml(repairCase.image)}" alt="${escapeHtml(repairCase.alt)}">`
                        : `<div class="recent-case-placeholder" aria-hidden="true"></div>`}
                </div>
                <div class="recent-case-body">
                    ${repairCase.brand ? `<p class="recent-case-brand">${escapeHtml(repairCase.brand)}</p>` : ""}
                    <h3 class="recent-case-model">${escapeHtml(repairCase.model)}</h3>
                    ${repairCase.meta ? `<p class="recent-case-meta">${escapeHtml(repairCase.meta)}</p>` : ""}
                    <p class="recent-case-repair">${escapeHtml(repairCase.repair)}</p>
                    <span class="recent-case-more">詳しく見る →</span>
                </div>
            </a>`
                    )
                    .join("")}
                </div>`
                )
                .join("")}
            </div>
        </div>
        <div class="recent-cases-action">
            <a class="recent-cases-button" href="/cases/gallery">修理事例を検索する</a>
        </div>
    </div>
</section>

<section id="flow" class="homepage-flow-section">
    <div class="homepage-flow-inner">
        <h2 class="homepage-flow-heading">修理の流れとポイント</h2>
        <p class="homepage-flow-lead">LINEでのご相談から、受付・見積り・修理・納品までの流れと、事前に確認しておきたいポイントをご確認いただけます。</p>
        <ol class="homepage-flow-steps">
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">01</span>
                <span class="homepage-flow-label">LINE相談</span>
                <span class="homepage-flow-note">写真と分かる範囲の情報を送信</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">02</span>
                <span class="homepage-flow-label">概算案内</span>
                <span class="homepage-flow-note">受付前に費用感を確認</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">03</span>
                <span class="homepage-flow-label">郵送</span>
                <span class="homepage-flow-note">梱包して時計を発送</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">04</span>
                <span class="homepage-flow-label">受付</span>
                <span class="homepage-flow-note">状態・付属品を確認</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">05</span>
                <span class="homepage-flow-label">正式見積り</span>
                <span class="homepage-flow-note">実物確認後にご案内</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">06</span>
                <span class="homepage-flow-label">承認・キャンセル</span>
                <span class="homepage-flow-note">納得後に作業開始</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">07</span>
                <span class="homepage-flow-label">修理</span>
                <span class="homepage-flow-note">分解・洗浄・調整</span>
            </li>
            <li class="homepage-flow-step">
                <span class="homepage-flow-number">08</span>
                <span class="homepage-flow-label">納品・保証</span>
                <span class="homepage-flow-note">確認後に返送</span>
            </li>
        </ol>
        <div class="homepage-flow-detail">
            <a class="homepage-flow-detail-link" href="/repair-flow">詳しく見る</a>
        </div>
    </div>
</section>

`;
}

const HTML_FLOW_FOOTER = `
<section id="faq" class="section faq-section" style="background-color: white;">
    <div class="container">
        <h2 class="section-title">&#12424;&#12367;&#12354;&#12427;&#36074;&#21839;</h2>
        <div class="faq-list">
            <div class="faq-item">
                <h3 class="faq-question">&#30456;&#35527;&#12384;&#12369;&#12391;&#12418;&#22823;&#19976;&#22827;&#12391;&#12377;&#12363;&#65311;</h3>
                <p class="faq-answer">&#12399;&#12356;&#12290;&#12372;&#30456;&#35527;&#12384;&#12369;&#12391;&#20462;&#29702;&#21463;&#20184;&#12395;&#12399;&#12394;&#12426;&#12414;&#12379;&#12435;&#12290;&#20889;&#30495;&#12539;&#22411;&#30058;&#12539;&#30151;&#29366;&#12434;&#30906;&#35469;&#12375;&#12289;&#21463;&#20184;&#21069;&#12395;&#12391;&#12365;&#12427;&#38480;&#12426;&#29694;&#23455;&#12395;&#36817;&#12356;&#27010;&#31639;&#12434;&#12372;&#26696;&#20869;&#12375;&#12414;&#12377;&#12290;<br><a class="faq-detail-link" href="/line-consultation">LINE相談について詳しく見る →</a></p>
            </div>
            <div class="faq-item">
                <h3 class="faq-question">&#21463;&#20184;&#21069;&#12395;&#27010;&#31639;&#12399;&#20998;&#12363;&#12426;&#12414;&#12377;&#12363;&#65311;</h3>
                <p class="faq-answer">LINE&#12391;&#20889;&#30495;&#12420;&#30151;&#29366;&#12434;&#30906;&#35469;&#12375;&#12383;&#12358;&#12360;&#12391;&#12289;&#21487;&#33021;&#12394;&#31684;&#22258;&#12391;&#27010;&#31639;&#12434;&#12372;&#26696;&#20869;&#12375;&#12414;&#12377;&#12290;&#12383;&#12384;&#12375;&#12289;&#27491;&#24335;&#12394;&#37329;&#38989;&#12399;&#23455;&#29289;&#30906;&#35469;&#24460;&#12398;&#12362;&#35211;&#31309;&#12426;&#12392;&#12394;&#12426;&#12414;&#12377;&#12290;<br><a class="faq-detail-link" href="/line-consultation">概算相談について詳しく見る →</a></p>
            </div>
            <div class="faq-item">
                <h3 class="faq-question">&#32020;&#27491;&#37096;&#21697;&#12391;&#20462;&#29702;&#12391;&#12365;&#12414;&#12377;&#12363;&#65311;</h3>
                <p class="faq-answer">&#20837;&#25163;&#21487;&#33021;&#12394;&#22580;&#21512;&#12399;&#32020;&#27491;&#37096;&#21697;&#12391;&#12398;&#23550;&#24540;&#12434;&#26908;&#35342;&#12375;&#12414;&#12377;&#12290;&#32020;&#27491;&#37096;&#21697;&#12364;&#20837;&#25163;&#22256;&#38627;&#12394;&#22580;&#21512;&#12399;&#12289;&#36969;&#21512;&#37096;&#21697;&#12420;&#21152;&#24037;&#12539;&#35069;&#20316;&#12434;&#21547;&#12417;&#12390;&#23550;&#24540;&#26041;&#27861;&#12434;&#12372;&#35500;&#26126;&#12375;&#12414;&#12377;&#12290;<br><a class="faq-detail-link" href="/parts-sourcing">部品調達について詳しく見る →</a></p>
            </div>
            <div class="faq-item">
                <h3 class="faq-question">&#38450;&#27700;&#26908;&#26619;&#12399;&#12375;&#12390;&#12356;&#12414;&#12377;&#12363;&#65311;</h3>
                <p class="faq-answer">&#12458;&#12540;&#12496;&#12540;&#12507;&#12540;&#12523;&#24460;&#12399;&#38450;&#27700;&#26908;&#26619;&#12434;&#34892;&#12356;&#12414;&#12377;&#12290;&#35023;&#33995;&#12539;&#12522;&#12517;&#12540;&#12474;&#12539;&#12503;&#12483;&#12471;&#12515;&#12540;&#12539;&#12460;&#12521;&#12473;&#12414;&#12431;&#12426;&#12398;&#12497;&#12483;&#12461;&#12531;&#12418;&#30906;&#35469;&#12375;&#12414;&#12377;&#12290;<br><a class="faq-detail-link" href="/waterproof-check">防水確認について詳しく見る →</a></p>
            </div>
            <div class="faq-item">
                <h3 class="faq-question">&#20182;&#24215;&#12391;&#26029;&#12425;&#12428;&#12383;&#26178;&#35336;&#12391;&#12418;&#30456;&#35527;&#12391;&#12365;&#12414;&#12377;&#12363;&#65311;</h3>
                <p class="faq-answer">&#29366;&#24907;&#12420;&#37096;&#21697;&#20837;&#25163;&#29366;&#27841;&#12395;&#12424;&#12426;&#12414;&#12377;&#12364;&#12289;&#37096;&#21697;&#35519;&#36948;&#12539;&#21152;&#24037;&#12539;&#35069;&#20316;&#12418;&#21547;&#12417;&#12390;&#20462;&#29702;&#12398;&#21487;&#33021;&#24615;&#12434;&#30906;&#35469;&#12375;&#12414;&#12377;&#12290;&#12414;&#12378;&#12399;&#20889;&#30495;&#12392;&#30151;&#29366;&#12434;&#12362;&#36865;&#12426;&#12367;&#12384;&#12373;&#12356;&#12290;<br><a class="faq-detail-link" href="/difficult-repair">修理の可能性について見る →</a></p>
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

<footer>
    <div class="container">
        <img src="/img/logo.png" alt="ヨシダ時計修理工房 ロゴ" class="footer-logo-img">
        <div class="footer-name">ヨシダ時計修理工房</div>
        <p class="copyright">&copy; 2026 ヨシダ時計修理工房 All rights reserved.</p>
    </div>
</footer>
`;

const heroImage = "/img/watch-submariner.jpg";

export default async function TopPage() {
    const recentRepairCases = (await getLatestB2CPublicCasesForHome(10)).map(toHomeRecentCase);

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />

            <div dangerouslySetInnerHTML={{ __html: HTML_HEADER }} />

            {/* Hero */}
            <section
                className="hero"
                style={{
                    backgroundImage: `linear-gradient(90deg, rgba(8, 18, 34, 0.86) 0%, rgba(8, 18, 34, 0.7) 42%, rgba(8, 18, 34, 0.28) 100%), url(${heroImage})`,
                }}
            >
                <div className="hero-inner">
                    <p className="hero-eyebrow">{"\u4fee\u7406\u6b7420\u5e74\u30fb1\u7d1a\u6642\u8a08\u4fee\u7406\u6280\u80fd\u58eb"}</p>
                    <h1 className="hero-title">
                        <span className="hero-title-line">{"\u4ed6\u5e97\u3067\u65ad\u3089\u308c\u305f\u6642\u8a08\u3082\u3001"}</span>
                        <span className="hero-title-line">{"\u307e\u305a\u3054\u76f8\u8ac7\u304f\u3060\u3055\u3044\u3002"}</span>
                    </h1>
                    <p className="hero-lead">
                        {"\u90e8\u54c1\u8abf\u9054\u30fb\u52a0\u5de5\u30fb\u88fd\u4f5c\u307e\u3067\u542b\u3081\u3066\u3001\u4fee\u7406\u306e\u53ef\u80fd\u6027\u3092\u63a2\u308a\u307e\u3059\u3002"}<br />
                        {"LINE\u3067\u6642\u8a08\u306e\u5199\u771f\u3084\u3001\u5206\u304b\u308b\u7bc4\u56f2\u306e\u60c5\u5831\u3092\u78ba\u8a8d\u3057\u306a\u304c\u3089\u3001\u53d7\u4ed8\u524d\u306b\u3067\u304d\u308b\u9650\u308a\u73fe\u5b9f\u306b\u8fd1\u3044\u6982\u7b97\u3092\u3054\u6848\u5185\u3057\u307e\u3059\u3002"}
                    </p>
                    <div className="hero-actions">
                        <Link href="/cases/gallery" className="btn hero-case-btn">{"\u4fee\u7406\u4e8b\u4f8b\u3092\u691c\u7d22\u3059\u308b"}</Link>
                    </div>
                </div>
            </section>

            <div dangerouslySetInnerHTML={{ __html: buildAboutPriceHtml(recentRepairCases) }} />

            <div dangerouslySetInnerHTML={{ __html: HTML_FLOW_FOOTER }} />
        </>
    );
}
