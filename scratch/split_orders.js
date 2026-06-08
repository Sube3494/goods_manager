const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, '../src/app/orders/page.tsx');
const cardPath = path.join(__dirname, '../src/app/orders/OrderCard.tsx');

function run() {
  console.log("Reading page.tsx...");
  const content = fs.readFileSync(pagePath, 'utf8');
  // 按照换行符分割，兼容 windows CRLF
  const lines = content.split(/\r?\n/);
  
  // 第 89 行（索引 88）到第 1564 行（索引 1563）
  const targetStart = 88;
  const targetEnd = 1563;
  
  const extractedLines = lines.slice(targetStart, targetEnd + 1);
  const remainingLines = [
    ...lines.slice(0, targetStart),
    // 插入 import 引用
    'import {',
    '  OrderCard,',
    '  OrderCardErrorBoundary,',
    '  toCurrency,',
    '  formatPercent,',
    '  isCancelledStatus,',
    '  isCompletedStatus,',
    '  isTerminalStatus,',
    '  isDeliveringStatus,',
    '  isAbnormalStatus,',
    '  getDeadlineDisplay,',
    '  formatCompactDateTime,',
    '  summarizeOrders,',
    '  getOrderActionErrorMessage,',
    '  getBrushSyncSkippedReasonText,',
    '  getAutoPickSyncSkippedReasonText,',
    '  getItemCount,',
    '  serializeIntegrationConfig,',
    '  serializeMaiyatianMappings,',
    '  readIntegrationConfigResponse,',
    '  createDefaultSelfDeliveryTiming',
    '} from "./OrderCard";',
    ...lines.slice(targetEnd + 1)
  ];
  
  // 准备 OrderCard.tsx 的头部 imports
  const header = `"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Package2,
  RefreshCw,
  Search,
  Settings2,
  TriangleAlert,
  TimerReset,
  Truck,
  X,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { cn } from "@/lib/utils";
import { AutoPickOrder, AutoPickOrderItem, OrderAction, PromotionPlatformAmounts } from "@/lib/types";
import { getBaseAutoPickStatusDisplay } from "@/lib/autoPickOrderStatus";
import { formatLocalDate, formatLocalDateTime } from "@/lib/dateUtils";

`;

  let cardBody = extractedLines.join('\n');
  
  // 对需要导出的函数和类加 export 前缀
  const exports = [
    "createDefaultSelfDeliveryTiming",
    "normalizeSelfDeliveryTiming",
    "readIntegrationConfigResponse",
    "serializeIntegrationConfig",
    "serializeMaiyatianMappings",
    "getSyncErrorMessage",
    "formatTimingNumber",
    "toCurrency",
    "formatPercent",
    "getCommissionDisplay",
    "getExpectedIncome",
    "getDeliveryFee",
    "summarizeOrders",
    "getOrderActionErrorMessage",
    "getBrushSyncSkippedReasonText",
    "getAutoPickSyncSkippedReasonText",
    "getDisplayStatus",
    "isCompletedStatus",
    "isCancelledStatus",
    "isTerminalStatus",
    "isDeliveringStatus",
    "isAbnormalStatus",
    "isBrushSyncEligibleOrder",
    "getStatusTone",
    "hasAutoCompleteFailure",
    "hasAutoOutboundFailure",
    "getPlatformBadgeMeta",
    "getOrderItemDisplay",
    "getExpandedOrderItemDisplays",
    "getOrderSourceLabel",
    "getFulfillmentLabel",
    "getOrderTypeLabel",
    "getItemCount",
    "formatDistanceKm",
    "formatCompactDateTime",
    "getFilterDateValue",
    "getProductCostStatusText",
    "getDeadlineDisplay",
    "MetricCard",
    "PromotionEditModal",
    "PromotionMetricCard",
    "StatusBadge",
    "DetailStat",
    "DetailBlock",
    "ProductStripItem",
    "ActionButton",
    "OrderCard",
    "OrderCardErrorBoundary"
  ];
  
  exports.forEach(name => {
    // 替换 function name
    cardBody = cardBody.replace(new RegExp(`\\bfunction ${name}\\b`, 'g'), `export function ${name}`);
    // 替换 class name
    cardBody = cardBody.replace(new RegExp(`\\bclass ${name}\\b`, 'g'), `export class ${name}`);
  });
  
  const finalCardContent = header + cardBody;
  const finalPageContent = remainingLines.join('\n');
  
  console.log("Writing OrderCard.tsx...");
  fs.writeFileSync(cardPath, finalCardContent, 'utf8');
  
  console.log("Writing page.tsx...");
  fs.writeFileSync(pagePath, finalPageContent, 'utf8');
  
  console.log("Split successfully finished!");
}

run();
