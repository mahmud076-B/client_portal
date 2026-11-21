import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**", "portal/**", "next-env.d.ts", "tw.config.js"],
  },
];

export default eslintConfig;
