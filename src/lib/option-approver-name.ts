// A public share link does not authenticate the person opening it. For an
// individual customer, this is the registered customer name for the audit row.
export function optionApproverName(customerType: string, registeredName: string | null, submittedName: unknown): string | null {
  if (customerType === "individual") {
    const name = registeredName?.trim() ?? "";
    return name && !/^[?？\s]+$/.test(name) && !["一般のお客様", "お客様", "未設定", "氏名未登録"].includes(name)
      ? name.slice(0, 100) : "登録名なし（個人）";
  }
  const name = typeof submittedName === "string" ? submittedName.trim() : "";
  return name && name.length <= 100 ? name : null;
}
