import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";

const PASSWORD_HASH_PREFIX = "s1";
const PASSWORD_SETUP_TOKEN_PURPOSE = "password-setup";
const PASSWORD_RESET_TOKEN_PURPOSE = "password-reset";
const PASSWORD_SETUP_TOKEN_TTL = "10m";

function getJwtKey() {
  const secretKey = process.env.JWT_SECRET;
  if (!secretKey) {
    throw new Error("JWT_SECRET is required");
  }

  return new TextEncoder().encode(secretKey);
}

function normalizePassword(password: string) {
  return String(password || "");
}

export function validatePassword(password: string) {
  const normalizedPassword = normalizePassword(password);

  if (normalizedPassword.length < 8) {
    return "密码至少需要 8 位";
  }

  if (!/[A-Za-z]/.test(normalizedPassword)) {
    return "密码至少需要包含 1 个字母";
  }

  if (!/\d/.test(normalizedPassword)) {
    return "密码至少需要包含 1 个数字";
  }

  return null;
}

export function hashPassword(password: string) {
  const normalizedPassword = normalizePassword(password);
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(normalizedPassword, salt, 64).toString("hex");

  return `${PASSWORD_HASH_PREFIX}:${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) {
    return false;
  }

  const [prefix, salt, storedHash] = passwordHash.split(":");
  if (prefix !== PASSWORD_HASH_PREFIX || !salt || !storedHash) {
    return false;
  }

  const incomingHash = scryptSync(normalizePassword(password), salt, 64);
  const storedHashBuffer = Buffer.from(storedHash, "hex");

  if (incomingHash.length !== storedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(incomingHash, storedHashBuffer);
}

export async function createPasswordSetupToken(payload: { userId: string; email: string }) {
  return new SignJWT({
    purpose: PASSWORD_SETUP_TOKEN_PURPOSE,
    userId: payload.userId,
    email: payload.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(PASSWORD_SETUP_TOKEN_TTL)
    .sign(getJwtKey());
}

export async function verifyPasswordSetupToken(token: string) {
  return verifyPasswordToken(token, PASSWORD_SETUP_TOKEN_PURPOSE);
}

export async function createPasswordResetToken(payload: { userId: string; email: string }) {
  return new SignJWT({
    purpose: PASSWORD_RESET_TOKEN_PURPOSE,
    userId: payload.userId,
    email: payload.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(PASSWORD_SETUP_TOKEN_TTL)
    .sign(getJwtKey());
}

export async function verifyPasswordResetToken(token: string) {
  return verifyPasswordToken(token, PASSWORD_RESET_TOKEN_PURPOSE);
}

async function verifyPasswordToken(token: string, expectedPurpose: string) {
  const { payload } = await jwtVerify(token, getJwtKey(), {
    algorithms: ["HS256"],
  });

  if (payload.purpose !== expectedPurpose) {
    throw new Error("Invalid password token");
  }

  return {
    userId: String(payload.userId || ""),
    email: String(payload.email || "").toLowerCase().trim(),
  };
}
