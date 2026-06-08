const { SignJWT } = require('jose');

const secretKey = "ldcabFDI6RbRfOc00k7jIiQic41Wr5nOLVlINwLPRWA=";
function getJwtKey() {
  return new TextEncoder().encode(secretKey);
}

async function main() {
  const userData = {
    id: "cmpwr5a3900023vop52xkgzz0",
    email: "2237608602@qq.com",
    role: "SUPER_ADMIN",
  };
  const expires = new Date(Date.now() + 60 * 60 * 24 * 7 * 1000);
  const sessionId = "test-session-id";
  const payload = {
    ...userData,
    sessionId,
    user: userData,
    expires
  };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtKey());
  console.log(token);
}

main().catch(console.error);
