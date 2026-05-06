import { useState, useEffect } from "react";

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
  longitude?: number;
  latitude?: number;
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

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchUser();
  }, []);

  return { user, isLoading };
}
