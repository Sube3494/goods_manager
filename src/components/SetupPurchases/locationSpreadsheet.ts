import type { CoverageAnalysis, Point } from "./locationUtils";

const headers = ["地名", "地址", "纬度", "经度", "半径（公里）", "固定位置", "隐藏覆盖圈"];
const nameHeaders = ["地名", "地点", "地点名称", "点位名称", "名称", "name"];

export type ImportPoint = Omit<Point, "lat" | "lng"> & {
  lat?: number;
  lng?: number;
  row: number;
};

export function parseLocationRows(rows: unknown[][]): ImportPoint[] {
  const first = rows.findIndex((row) => row.some((cell) => String(cell ?? "").trim()));
  if (first === -1) throw new Error("请至少填写一个地名。");

  const columns = rows[first].map((cell) => String(cell ?? "").trim().toLowerCase());
  const nameColumn = columns.findIndex((column) => nameHeaders.includes(column));
  const hasHeader = nameColumn !== -1;
  const start = first + Number(hasHeader);
  const columnIndex = (aliases: string[]) => hasHeader ? columns.findIndex((column) => aliases.includes(column)) : -1;
  const addressColumn = columnIndex(["地址", "详细地址", "address"]);
  const latColumn = columnIndex(["纬度", "lat"]);
  const lngColumn = columnIndex(["经度", "lng"]);
  const radiusColumn = columnIndex(["半径", headers[4], "r"]);
  const pinnedColumn = columnIndex([headers[5]]);
  const hiddenColumn = columnIndex([headers[6]]);

  const points = rows.slice(start).flatMap((row, index) => {
    const text = (column: number) => String(row[column] ?? "").trim();
    if (!row.some((cell) => String(cell ?? "").trim())) return [];
    const rowNumber = start + index + 1;
    const name = text(hasHeader ? nameColumn : 0);
    if (!name) throw new Error(`第 ${rowNumber} 行缺少地名。`);
    const latText = text(latColumn);
    const lngText = text(lngColumn);
    const lat = latText ? Number(latText) : undefined;
    const lng = lngText ? Number(lngText) : undefined;
    if ((latText || lngText) && (lat === undefined || lng === undefined ||
        !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
      throw new Error(`第 ${rowNumber} 行经纬度有误，请同时填写有效经纬度，或留空自动定位。`);
    }
    const radius = text(radiusColumn);
    const r = radius ? Number(radius) : 10;
    if (!Number.isFinite(r) || r <= 0) throw new Error(`第 ${rowNumber} 行半径必须大于 0。`);
    return [{
      name,
      address: text(addressColumn) || undefined,
      lat,
      lng,
      r,
      isPinned: text(pinnedColumn) === "是",
      hideRing: text(hiddenColumn) === "是",
      row: rowNumber,
    }];
  });
  if (!points.length) throw new Error("请至少填写一个地名。");
  if (points.length > 20) throw new Error("每次最多导入 20 个点位，请减少行数后重试。");
  return points;
}

export async function readLocationWorkbook(file: File) {
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Excel 文件没有可读取的工作表。");
  return parseLocationRows(xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, blankrows: true }));
}

export async function exportLocationWorkbook(
  region: string,
  points: Point[],
  analysis: CoverageAnalysis,
) {
  const xlsx = await import("xlsx");
  const workbook = xlsx.utils.book_new();
  const rows = points.map((point, index) => [
    point.name, point.address ?? "", point.lat, point.lng, point.r,
    point.isPinned ? "是" : "", point.hideRing ? "是" : "",
    analysis.rows[index]?.area ?? 0, (analysis.rows[index]?.unique ?? 0) * 100,
  ]);
  const pointsSheet = xlsx.utils.aoa_to_sheet([[...headers, "覆盖面积（平方公里）", "独占覆盖率（%）"], ...rows]);
  pointsSheet["!cols"] = [28, 44, 16, 16, 16, 12, 14, 24, 24].map((wch) => ({ wch }));
  xlsx.utils.book_append_sheet(workbook, pointsSheet, "点位");
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ["地区", region],
    ["总覆盖面积（平方公里）", analysis.union],
    ["重叠面积（平方公里）", analysis.multi],
  ]), "覆盖汇总");
  xlsx.writeFile(workbook, `${region}_开店选址覆盖分析.xlsx`);
}
