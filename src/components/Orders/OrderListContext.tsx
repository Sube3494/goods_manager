"use client";

import { createContext } from "react";
import type { AllOrdersViewProps } from "@/app/orders/AllOrdersView";

export type OrderListContextValue = Pick<AllOrdersViewProps,
  "refreshTrigger" | "targetRefreshOrder" | "onClearProfitUpdating" | "onOpenCostBackfill"
  | "onOpenMatchEditor" | "onRemoveBundleComponent" | "onOpenPurchaseDraft"
  | "profitUpdatingOrderIds" | "localShops" | "userId" | "readOnly"
  | "canExpandDetails" | "canViewProductCosts"
>;

export const OrderListContext = createContext<OrderListContextValue | null>(null);
