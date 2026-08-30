import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// The Anthropic key lives in a single gitignored .env at the repository root,
// shared with the Python pipeline. Loading it here avoids a second copy of the
// secret inside web/. On Vercel the file does not exist and this is a no-op:
// the key comes from the project's environment variables instead.
loadEnv({ path: path.resolve(process.cwd(), "..", ".env"), quiet: true });

const nextConfig: NextConfig = {};

export default nextConfig;
