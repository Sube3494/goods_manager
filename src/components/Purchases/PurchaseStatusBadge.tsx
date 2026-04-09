"use client";

import { PurchaseStatus } from "@/lib/types";
import { getPurchaseStatusColor, getPurchaseStatusLabel } from "@/lib/purchases";

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getPurchaseStatusColor(status)}`}
    >
      {getPurchaseStatusLabel(status)}
    </span>
  );
}
