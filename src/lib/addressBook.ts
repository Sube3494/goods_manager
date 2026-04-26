type AddressLike = {
  address?: string | null;
  detailAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
};

type ParsedAddressParts = {
  contactName: string;
  contactPhone: string;
  detailAddress: string;
};

function normalizeWhitespace(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripDeliveryNotes(value: string) {
  return value
    .replace(/[（(][^()（）]*(送货上门|送上楼|上楼|联系|电话|备注|必看|一定要)[^()（）]*[)）]/gi, " ")
    .replace(/(?:备注|要求|说明)[:：].*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeAddressStart(value: string) {
  return /^(?:中国|广东|广西|贵州|云南|四川|重庆|北京|上海|天津|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|海南|陕西|甘肃|青海|台湾|内蒙古|西藏|宁夏|新疆|香港|澳门|广州市|深圳市|遵义市|白云区|南明区|花溪区)/.test(value);
}

export function parseAddressComposite(value: string): ParsedAddressParts {
  const raw = normalizeWhitespace(value);
  if (!raw) {
    return {
      contactName: "",
      contactPhone: "",
      detailAddress: "",
    };
  }

  const phoneMatch = raw.match(/1[3-9]\d{9}/);
  const contactPhone = phoneMatch?.[0] || "";
  const withoutPhone = contactPhone ? normalizeWhitespace(raw.replace(contactPhone, " ")) : raw;
  const withoutNotes = stripDeliveryNotes(withoutPhone);

  let contactName = "";
  let detailAddress = withoutNotes;

  const leadingMatch = withoutNotes.match(/^([\u4e00-\u9fa5A-Za-z]{2,8})\s+(.*)$/);
  if (leadingMatch && looksLikeAddressStart(leadingMatch[2])) {
    contactName = leadingMatch[1].trim();
    detailAddress = leadingMatch[2].trim();
  } else {
    const compactLeadingMatch = withoutNotes.match(/^([\u4e00-\u9fa5A-Za-z]{2,4})(广东|广西|贵州|云南|四川|重庆|北京|上海|天津|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|海南|陕西|甘肃|青海|台湾|内蒙古|西藏|宁夏|新疆|香港|澳门|广州市|深圳市|遵义市)/);
    if (compactLeadingMatch) {
      contactName = compactLeadingMatch[1].trim();
      detailAddress = withoutNotes.slice(contactName.length).trim();
    }
  }

  return {
    contactName,
    contactPhone,
    detailAddress: normalizeWhitespace(detailAddress),
  };
}

export function normalizeAddressItemParts(item: AddressLike | null | undefined) {
  const contactName = String(item?.contactName || "").trim();
  const contactPhone = String(item?.contactPhone || "").trim();
  const detailAddress = String(item?.detailAddress || "").trim();

  if (contactName || contactPhone || detailAddress) {
    return {
      contactName,
      contactPhone,
      detailAddress: detailAddress || getAddressDetail(item),
    };
  }

  return parseAddressComposite(String(item?.address || ""));
}

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
