/** Shipment dates always use the business timezone, independently of the browser. */
export function shipmentDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const date = new Date(Date.parse(value) + 8 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function shipmentTimeText(value?: string) {
  if (!shipmentDate(value)) return "未记录发货时间";
  return new Date(Date.parse(value!) + 8 * 60 * 60 * 1000)
    .toISOString().slice(0, 16).replace("T", " ");
}

export function matchesShipmentDate(value: string | undefined, start: string, end: string) {
  if (!start && !end) return true;
  const date = shipmentDate(value);
  return Boolean(date && (!start || date >= start) && (!end || date <= end));
}
