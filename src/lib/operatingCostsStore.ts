import { promises as fs } from "fs";
import path from "path";

type StoredProfile = {
  userId: string;
  shopName: string;
  monthlyRent: number;
  monthlyLabor: number;
  allocationBaseDays: number;
};

type StoredBill = {
  userId: string;
  shopName: string;
  monthKey: string;
  waterAmount: number;
  electricAmount: number;
  sharedElectricAmount: number;
  propertyFeeAmount: number;
};

type OperatingCostsStore = {
  profiles: StoredProfile[];
  bills: StoredBill[];
};

const STORE_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(STORE_DIR, "operating-costs.json");

async function ensureStore() {
  await fs.mkdir(STORE_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    const initial: OperatingCostsStore = { profiles: [], bills: [] };
    await fs.writeFile(STORE_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<OperatingCostsStore> {
  await ensureStore();
  const content = await fs.readFile(STORE_PATH, "utf8");
  const parsed = JSON.parse(content) as Partial<OperatingCostsStore>;
  return {
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
    bills: Array.isArray(parsed.bills) ? parsed.bills : [],
  };
}

async function writeStore(store: OperatingCostsStore) {
  await ensureStore();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function getStoredOperatingCostProfile(userId: string, shopName: string) {
  const store = await readStore();
  return store.profiles.find((item) => item.userId === userId && item.shopName === shopName) || null;
}

export async function saveStoredOperatingCostProfile(profile: StoredProfile) {
  const store = await readStore();
  const nextProfiles = store.profiles.filter((item) => !(item.userId === profile.userId && item.shopName === profile.shopName));
  nextProfiles.push(profile);
  await writeStore({ ...store, profiles: nextProfiles });
  return profile;
}

export async function getStoredOperatingCostBill(userId: string, shopName: string, monthKey: string) {
  const store = await readStore();
  return store.bills.find((item) => item.userId === userId && item.shopName === shopName && item.monthKey === monthKey) || null;
}

export async function listStoredOperatingCostBills(userId: string, shopName: string, take = 6) {
  const store = await readStore();
  return store.bills
    .filter((item) => item.userId === userId && item.shopName === shopName)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .slice(0, take);
}

export async function saveStoredOperatingCostBill(bill: StoredBill) {
  const store = await readStore();
  const nextBills = store.bills.filter((item) => !(
    item.userId === bill.userId
    && item.shopName === bill.shopName
    && item.monthKey === bill.monthKey
  ));
  nextBills.push(bill);
  await writeStore({ ...store, bills: nextBills });
  return bill;
}
