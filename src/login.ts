import http from "node:http";
import type { AddressInfo } from "node:net";
import { buildAuthUrl, exchangeCode } from "./auth.js";

/** One time sign in on your own computer. Prints the three values to put in your MCP config. */
export async function login(clientId: string, clientSecret: string): Promise<void> {
  const server = http.createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}`;

  console.log("Open this link in your browser and approve read only access:\n");
  console.log(buildAuthUrl(clientId, redirectUri) + "\n");
  console.log("Waiting for Google to send you back here...");

  const code: string = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out after 5 minutes.")), 5 * 60_000);
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      const c = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(c ? "All set. You can close this tab and go back to your terminal." : "Sign in was cancelled. You can close this tab.");
      if (c) {
        clearTimeout(timer);
        resolve(c);
      } else if (err) {
        clearTimeout(timer);
        reject(new Error(`Google said: ${err}`));
      }
    });
  }).finally(() => server.close());

  const tokens = await exchangeCode({ clientId, clientSecret, code, redirectUri });
  console.log("\nDone. Put these in your MCP config env:\n");
  console.log(`GOOGLE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
}
