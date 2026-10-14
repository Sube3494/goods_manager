"use client";

import { OrderCard, OrderCardErrorBoundary } from "@/app/orders/OrderCard";
import type { ComponentProps } from "react";

export default function RelatedOrderCard(props: ComponentProps<typeof OrderCard>) {
  return (
    <OrderCardErrorBoundary orderNo={props.order.orderNo || props.order.id}>
      <OrderCard {...props} />
    </OrderCardErrorBoundary>
  );
}
