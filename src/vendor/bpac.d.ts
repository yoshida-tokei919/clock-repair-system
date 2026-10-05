export class IPrinter {
  GetInstalledPrinters(): Promise<string[]>;
  GetMediaName(): Promise<string>;
  IsPrinterOnline(name: string): Promise<boolean>;
}

export class IObject {
  get Text(): Promise<string>;
  set Text(value: string);
}

export class IDocument {
  static Open(filePath: string): Promise<boolean>;
  static Close(): Promise<boolean>;
  static SetPrinter(name: string, fit: boolean): Promise<boolean>;
  static GetPrinter(): Promise<IPrinter>;
  static GetMediaName(): Promise<string>;
  static readonly Width: Promise<number>;
  static readonly Length: Promise<number>;
  static GetObject(name: string): Promise<IObject | undefined>;
  static GetBarcodeIndex(name: string): Promise<number | undefined>;
  static SetBarcodeData(index: number, text: string): Promise<boolean>;
  static StartPrint(documentName: string, option: number): Promise<boolean>;
  static PrintOut(copyCount: number, option: number): Promise<boolean>;
  static EndPrint(): Promise<boolean>;
}

export function IsExtensionInstalled(): boolean;
