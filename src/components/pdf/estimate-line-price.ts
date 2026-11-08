export function formatEstimateLinePrice(price: number, quantity: number): string {
  const unitPrice = `¥${price.toLocaleString()}`;
  return quantity === 1 ? unitPrice : `${unitPrice} × ${quantity}`;
}
