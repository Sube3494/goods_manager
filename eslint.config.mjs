/*
 * @Date: 2026-02-07 00:08:33
 * @Author: Sube
 * @FilePath: eslint.config.mjs
 * @LastEditTime: 2026-02-16 22:03:56
 * @Description: 
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Docker 启动脚本，无需 ESLint 检查
    "scripts/**",
  ]),
]);

export default eslintConfig;
