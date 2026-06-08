const recipientPhoneRegex = /1[3-9]\d{9}/;
const addressKeywordRegex = /(省|自治区|特别行政区|市|区|县|镇|乡|街道|大道|路|街|巷|弄|号|栋|幢|单元|室|楼|层|园|苑|大厦|广场|公寓|小区|花园|村|宿舍|仓|收货|收件)/;

function isLikelyRecipientName(value) {
  const text = value.trim();
  if (!text || text.length > 12) return false;
  if (recipientPhoneRegex.test(text) || /\d/.test(text)) return false;
  if (addressKeywordRegex.test(text)) return false;
  return /^[\u4e00-\u9fa5·]{1,12}$/.test(text);
}

function isLikelyRecipientAddress(value) {
  const text = value.trim();
  if (!text) return false;
  if (addressKeywordRegex.test(text)) return true;
  return /[\d一二三四五六七八九十]/.test(text) && text.length >= 6;
}

function parseQuickAddressInput(input) {
  const normalizedInput = input || "";

  // 匹配并提取时间，支持常见的订单时间格式（含下单时间等前缀）
  const dateTimeRegex = /(?:(下单时间|创建时间|付款时间|申请时间|订单时间|时间)[:：]?\s*)?(?:(\d{4})[-/年.])?(\d{1,2})[-/月.](\d{1,2})日?\s+(\d{1,2})[点:](\d{1,2})(?:[分秒:]+(\d{1,2})秒?|分)?/i;
  const dateMatch = normalizedInput.match(dateTimeRegex);
  let parsedDate = undefined;
  let cleanInput = normalizedInput;

  if (dateMatch) {
    try {
      const year = dateMatch[2] || String(new Date().getFullYear());
      const month = String(dateMatch[3]).padStart(2, '0');
      const day = String(dateMatch[4]).padStart(2, '0');
      const hour = String(dateMatch[5]).padStart(2, '0');
      const minute = String(dateMatch[6]).padStart(2, '0');
      parsedDate = `${year}-${month}-${day} ${hour}:${minute}`;
      
      // 移除时间字符串以避免污染姓名和地址解析
      cleanInput = normalizedInput.replace(dateMatch[0], " ");
    } catch (e) {
      console.error("Failed to parse date in address parser:", e);
    }
  }

  const normalized = cleanInput
    .replace(/[（【]/g, "(")
    .replace(/[）】]/g, ")")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!normalized) {
    return {
      recipientName: "",
      recipientPhone: "",
      recipientAddress: "",
      remark: "",
      parsedDate,
    };
  }

  const remark = "";
  const core = normalized
    .replace(/[|｜]/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const phoneMatch = core.match(recipientPhoneRegex);
  if (!phoneMatch) {
    return {
      recipientName: "",
      recipientPhone: "",
      recipientAddress: core,
      remark,
      parsedDate,
    };
  }

  const recipientPhone = phoneMatch[0];
  const residual = core
    .slice(0, phoneMatch.index)
    .concat(" ", core.slice((phoneMatch.index || 0) + recipientPhone.length))
    .replace(/[，,;；]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const segments = residual
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  let recipientName = "";
  let recipientAddress = "";

  const addressSegments = segments.filter((segment) => isLikelyRecipientAddress(segment));
  const nameSegments = segments.filter((segment) => !addressSegments.includes(segment) && isLikelyRecipientName(segment));

  if (addressSegments.length > 0) {
    recipientAddress = addressSegments.join(" ");
  }
  if (nameSegments.length > 0) {
    recipientName = nameSegments[0];
  }

  if (segments.length === 1) {
    const singleLine = segments[0];
    const leadingNameMatch = singleLine.match(/^([\u4e00-\u9fa5·]{1,12})\s+(.+)$/);
    if (leadingNameMatch && isLikelyRecipientName(leadingNameMatch[1]) && isLikelyRecipientAddress(leadingNameMatch[2])) {
      recipientName = recipientName || leadingNameMatch[1].trim();
      recipientAddress = leadingNameMatch[2].trim();
    }

    const trailingNameMatch = singleLine.match(/^(.+?)\s+([\u4e00-\u9fa5·]{1,12})$/);
    if (trailingNameMatch && isLikelyRecipientAddress(trailingNameMatch[1]) && isLikelyRecipientName(trailingNameMatch[2])) {
      recipientAddress = trailingNameMatch[1].trim();
      recipientName = recipientName || trailingNameMatch[2].trim();
    }
  }

  if (!recipientAddress) {
    const nonNameSegments = segments.filter((segment) => segment !== recipientName);
    recipientAddress = nonNameSegments.join(" ").trim() || residual;
  }

  if (!recipientName) {
    const fallbackName = segments.find((segment) => isLikelyRecipientName(segment));
    recipientName = fallbackName || "";
  }

  if (recipientName && recipientAddress) {
    const escapedName = recipientName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const namePrefixRegex = new RegExp(`^(?:${escapedName}\\s*)+`, 'g');
    recipientAddress = recipientAddress.replace(namePrefixRegex, '').trim();
  }

  return {
    recipientName,
    recipientPhone,
    recipientAddress,
    remark,
    parsedDate,
  };
}

// 测试用例列表
const testCases = [
  "张三 13800000000 北京市海淀区中关村南大街1号(某某大厦3楼) 下单时间：2026-06-08 12:51:00",
  "06-08 12:51 浙江省杭州市西湖区西溪路1号 李四 13812345678",
  "王五，18911112222，上海市浦东新区世纪大道100号 2026/06/08 12:51",
  "赵六 13799998888 广州市天河区天河路208号 创建时间:2026年06月08日 12:51:00",
  "孙七 13566667777 北京市朝阳区建国门外大街1号 订单时间 06-08 12:51",
];

for (const tc of testCases) {
  console.log("----------------------------------------");
  console.log("输入:", tc.replace(/\n/g, ' '));
  console.log("结果:", JSON.stringify(parseQuickAddressInput(tc), null, 2));
}
