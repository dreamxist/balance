import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  minify: false,
  // Bundle workspace deps inline (@balance/core gets included)
  // External: only true npm deps that consumers will install
  noExternal: [/^@balance\//],
  external: ["@supabase/supabase-js", "commander"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
