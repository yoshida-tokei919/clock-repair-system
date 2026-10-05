import type { PhysicalTagLabel } from "./physical-tag-label";

type BpacPrinter = {
  GetInstalledPrinters(): Promise<string[]>;
  GetMediaName(): Promise<string>;
  IsPrinterOnline(name: string): Promise<boolean>;
};

type BpacDocument = {
  Open(filePath: string): Promise<boolean>;
  Close(): Promise<boolean>;
  SetPrinter(name: string, fit: boolean): Promise<boolean>;
  GetPrinter(): Promise<BpacPrinter>;
  GetMediaName(): Promise<string>;
  readonly Width: Promise<number>;
  readonly Length: Promise<number>;
  GetTextIndex(name: string): Promise<number | undefined>;
  SetText(index: number, text: string): Promise<boolean>;
  GetBarcodeIndex(name: string): Promise<number | undefined>;
  SetBarcodeData(index: number, text: string): Promise<boolean>;
  StartPrint(documentName: string, option: number): Promise<boolean>;
  PrintOut(copyCount: number, option: number): Promise<boolean>;
  EndPrint(): Promise<boolean>;
};

export type BpacRuntime = {
  IsExtensionInstalled(): boolean;
  IDocument: BpacDocument;
};

type PrintDependencies = {
  loadBpac?: () => Promise<BpacRuntime>;
  origin?: string;
  sleep?: (milliseconds: number) => Promise<void>;
  extensionChecks?: number;
};

export const BPAC_PRINTER_NAME = "Brother QL-800";
export const BPAC_MEDIA_NAME = "62mm";
export const BPAC_TEMPLATE_WIDTH = 3514;
export const BPAC_TEMPLATE_LENGTH = 4252;
export const BPAC_AUTO_CUT = 1;
export const BPAC_TEMPLATE_PATH = "/bpac/physical-tag-62x75.lbx";

const wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

function fitLine(value: string, maxCharacters: number): string {
  const characters = Array.from(value);
  return characters.length <= maxCharacters
    ? value
    : `${characters.slice(0, maxCharacters - 1).join("")}…`;
}

export function physicalTagBpacText(label: PhysicalTagLabel): {
  inquiry: string;
  shortCode: string;
  info: string;
} {
  const info = [
    label.partnerRef ? fitLine(`取引先管理番号 ${label.partnerRef}`, 20) : null,
    fitLine(`${label.customerType === "business" ? "取引先 " : "お客様 "}${label.customerName}`, 20),
    label.endUserName ? fitLine(`エンドユーザー ${label.endUserName}`, 20) : null,
    label.brand ? fitLine(`ブランド ${label.brand}`, 20) : null,
    label.model ? fitLine(`モデル ${label.model}`, 20) : null,
    label.reference ? fitLine(`Ref. ${label.reference}`, 20) : null,
    label.serialNumber ? fitLine(`シリアル ${label.serialNumber}`, 20) : null,
    label.caliber ? fitLine(`Cal. ${label.caliber}`, 20) : null,
    label.receptionDate ? fitLine(`受付日 ${label.receptionDate}`, 20) : null,
  ].filter((line): line is string => Boolean(line));

  return {
    inquiry: fitLine(`受付 ${label.inquiryNumber}`, 18),
    shortCode: fitLine(label.shortCode, 9),
    info: info.join("\r\n"),
  };
}

async function waitForExtension(
  bpac: BpacRuntime,
  sleep: (milliseconds: number) => Promise<void>,
  checks: number,
): Promise<void> {
  for (let attempt = 0; attempt < checks; attempt += 1) {
    if (bpac.IsExtensionInstalled()) return;
    if (attempt + 1 < checks) await sleep(100);
  }
  throw new Error("Brother b-PAC Extensionが見つかりません。Edgeの拡張機能を確認してください。");
}

function requireIndex(index: number | undefined, objectName: string): number {
  if (!Number.isInteger(index) || (index as number) < 0) {
    throw new Error(`印刷テンプレートに${objectName}がありません。`);
  }
  return index as number;
}

async function setTemplateData(document: BpacDocument, label: PhysicalTagLabel): Promise<void> {
  const text = physicalTagBpacText(label);
  const inquiryIndex = requireIndex(await document.GetTextIndex("objInquiry"), "objInquiry");
  const shortCodeIndex = requireIndex(await document.GetTextIndex("objShortCode"), "objShortCode");
  const infoIndex = requireIndex(await document.GetTextIndex("objInfo"), "objInfo");
  const qrIndex = requireIndex(await document.GetBarcodeIndex("objQr"), "objQr");

  if (!(await document.SetText(inquiryIndex, text.inquiry))) {
    throw new Error("受付番号を印刷テンプレートへ設定できませんでした。");
  }
  if (!(await document.SetText(shortCodeIndex, text.shortCode))) {
    throw new Error("管理タグ番号を印刷テンプレートへ設定できませんでした。");
  }
  if (!(await document.SetText(infoIndex, text.info))) {
    throw new Error("案件情報を印刷テンプレートへ設定できませんでした。");
  }
  if (!(await document.SetBarcodeData(qrIndex, label.qrPayload))) {
    throw new Error("QRコードを印刷テンプレートへ設定できませんでした。");
  }
}

async function defaultBpacLoader(): Promise<BpacRuntime> {
  return import("@/vendor/bpac.js") as Promise<BpacRuntime>;
}

function defaultOrigin(): string {
  if (typeof window === "undefined") {
    throw new Error("b-PAC直接印刷はブラウザから実行してください。");
  }
  return window.location.origin;
}

export async function printPhysicalTagLabel(
  label: PhysicalTagLabel,
  dependencies: PrintDependencies = {},
): Promise<void> {
  const bpac = await (dependencies.loadBpac ?? defaultBpacLoader)();
  await waitForExtension(
    bpac,
    dependencies.sleep ?? wait,
    dependencies.extensionChecks ?? 30,
  );

  const document = bpac.IDocument;
  const origin = dependencies.origin ?? defaultOrigin();
  const templateUrl = new URL(BPAC_TEMPLATE_PATH, origin).toString();
  let opened = false;
  let printStarted = false;
  let endPrintAttempted = false;

  try {
    if (!(await document.Open(templateUrl))) {
      throw new Error("b-PAC印刷テンプレートを開けませんでした。");
    }
    opened = true;

    if (!(await document.SetPrinter(BPAC_PRINTER_NAME, false))) {
      throw new Error("Brother QL-800を印刷先に指定できませんでした。");
    }

    const printer = await document.GetPrinter();
    const installedPrinters = await printer.GetInstalledPrinters();
    if (!installedPrinters.includes(BPAC_PRINTER_NAME)) {
      throw new Error("Brother QL-800が見つかりません。ドライバーを確認してください。");
    }
    if (!(await printer.IsPrinterOnline(BPAC_PRINTER_NAME))) {
      throw new Error("Brother QL-800がオフラインです。電源・USB接続を確認してください。");
    }

    const mountedMedia = await printer.GetMediaName();
    if (mountedMedia !== BPAC_MEDIA_NAME) {
      throw new Error(`Brother QL-800の用紙が${BPAC_MEDIA_NAME}ではありません（現在: ${mountedMedia || "不明"}）。`);
    }

    const [templateMedia, width, length] = await Promise.all([
      document.GetMediaName(),
      document.Width,
      document.Length,
    ]);
    if (templateMedia !== BPAC_MEDIA_NAME || width !== BPAC_TEMPLATE_WIDTH || length !== BPAC_TEMPLATE_LENGTH) {
      throw new Error("b-PAC印刷テンプレートの用紙設定が62 × 75 mmではありません。");
    }

    await setTemplateData(document, label);

    if (!(await document.StartPrint(`PhysicalTag ${label.shortCode}`, BPAC_AUTO_CUT))) {
      throw new Error("Brother QL-800の印刷を開始できませんでした。");
    }
    printStarted = true;

    if (!(await document.PrintOut(1, 0))) {
      throw new Error("Brother QL-800へラベルを送信できませんでした。");
    }

    endPrintAttempted = true;
    if (!(await document.EndPrint())) {
      throw new Error("Brother QL-800の印刷終了処理に失敗しました。");
    }
    printStarted = false;
  } finally {
    if (printStarted && !endPrintAttempted) {
      try {
        await document.EndPrint();
      } catch {
        // Preserve the primary print error while still attempting to close the print job.
      }
    }
    if (opened) {
      try {
        await document.Close();
      } catch {
        // A close failure must not trigger a fallback printer or duplicate print attempt.
      }
    }
  }
}
