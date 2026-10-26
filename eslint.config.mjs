import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "video/node_modules/**", "video/out/**", "src/lib/database.types.ts", "next-env.d.ts"] },
];

export default config;
