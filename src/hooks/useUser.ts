"use client";

import { createContext, createElement, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";

interface BrushShopItem {
  id: string;
  name: string;
  platform?: string;
  isDefault?: boolean;
}

interface AddressItem {
  id: string;
  label: string;
  address: string;
  detailAddress?: string;
  contactName?: string;
  contactPhone?: string;
  isDefault: boolean;
  disabled?: boolean;
  isDisabled?: boolean;
  serviceFeeRate?: number;
  longitude?: number;
  latitude?: number;
  libraryId?: string;
}

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  hasPassword?: boolean;
  brushShops?: BrushShopItem[];
  brushCommissionBoostEnabled?: boolean;
  shippingAddresses?: AddressItem[];
  roleProfile?: {
    id: string;
    name: string;
    permissions: Record<string, boolean>;
  };
  permissions?: Record<string, boolean>;
}

const UserContext = createContext<{ user: User | null; isLoading: boolean } | null>(null);

function useUserRequest(enabled: boolean) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const requestRef = useRef<Promise<void> | null>(null);
  const lastFetchedRef = useRef(0);

  const fetchUser = useCallback(() => {
    if (requestRef.current) return requestRef.current;
    const request = (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user ?? null);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      } finally {
        lastFetchedRef.current = Date.now();
        setIsLoading(false);
      }
    })();
    requestRef.current = request;
    void request.finally(() => { requestRef.current = null; });
    return request;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void fetchUser();
    // Refresh permissions in the background without hiding the current page.
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetchedRef.current >= 60_000) void fetchUser();
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [enabled, fetchUser]);

  return { user, isLoading };
}

export function UserProvider({ children }: { children: ReactNode }) {
  const session = useUserRequest(true);
  return createElement(UserContext.Provider, { value: session }, children);
}

export function useUser() {
  const shared = useContext(UserContext);
  const standalone = useUserRequest(shared === null);
  return shared ?? standalone;
}
