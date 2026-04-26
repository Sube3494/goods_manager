type AddressLike = {
  address?: string | null;
  detailAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
};

export function getAddressDetail(item: AddressLike | null | undefined) {
  const detailAddress = String(item?.detailAddress || "").trim();
  if (detailAddress) {
    return detailAddress;
  }

  return String(item?.address || "").trim();
}

export function buildAddressDisplay(item: AddressLike | null | undefined) {
  const contactName = String(item?.contactName || "").trim();
  const contactPhone = String(item?.contactPhone || "").trim();
  const detailAddress = getAddressDetail(item);

  return [contactName, contactPhone, detailAddress].filter(Boolean).join(" ").trim();
}
