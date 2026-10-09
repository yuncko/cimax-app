/**
 * JS unpacker for p.a.c.k.e.r / eval-obfuscated host pages.
 * Port of lscofield/node-urlresolver-api lib/unpacker.js — pure server-side, no browser.
 * Also handles the bespoke FaselHD chunked-base64+charcode variant.
 */

export function unpackPacker(packed: string): string {
  if (!packed || !packed.includes("eval")) return packed;
  // Extract the eval(function(p,a,c,k,e,d){...}) call
  const evalMatch = packed.match(/eval\s*\(function\s*\(p,a,c,k[\s\S]*?\{[\s\S]*?\}\s*\(.*?\)\s*\)/);
  const target = evalMatch ? evalMatch[0] : packed;

  let unpacked = "";
  try {
    // Sandboxed eval via Function — captures the unpacked string instead of executing globally.
    // The classic packer ends with: eval(function(p,a,c,k,e,d){...}('...',62,...))
    // We intercept by replacing the outer eval with assignment.
    const code = target.replace(/^eval\s*\(/, "unpacked = (").replace(/\s*\)\s*;?\s*$/, ");");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let _unpacked = "";
    // Use indirect eval in isolated scope
    const fn = new Function("unpacked", `${code.replace("unpacked =", "unpacked =")}; return unpacked;`);
    // Simpler: just run with Function constructor that captures eval result
    let result = "";
    const sandboxEval = (s: string) => { result = s; };
    // Build a tiny wrapper that replaces eval
    const wrapped = target.replace(/eval\s*\(/, "sandboxEval(");
    // Execute in a contained Function
    new Function("sandboxEval", wrapped)(sandboxEval);
    if (result) return result;
  } catch {
    // fall through
  }

  // Fallback: try the lscofield with(env){eval} trick via Function
  try {
    let out = "";
    const env = {
      eval: (code: string) => { out = code; },
      window: {},
      document: {},
    };
    // Use Function to avoid leaking scope
    new Function("env", `with(env){${target}}`)(env);
    if (out) return out;
  } catch {
    // ignore
  }
  return packed;
}

/**
 * FaselHD bespoke decoder: chunked base64 + additive cipher
 * Mirrors mhasan411/faselhd_api_node modules/getDirectLink.js
 */
export function decodeFaselhdEmbed(script: string): string | null {
  try {
    // Script contains an obfuscated payload; extract the numeric offset
    // Original: const regex = /\/g.....(.*?)\)/gm;
    const codeMatch = [...script.matchAll(/\/g.....(.*?)\)/gm)][0]?.[1];
    const code = codeMatch ? parseInt(codeMatch, 10) : NaN;
    if (Number.isNaN(code)) return null;

    const cleaned = script.replace(/['+\n]/g, "");
    const chunks = cleaned.split(".");
    let page = "";
    for (const elm of chunks) {
      if (!elm.trim()) continue;
      try {
        const decoded = Buffer.from(elm + "==", "base64").toString("ascii");
        const numMatch = decoded.match(/\d+/);
        if (!numMatch) continue;
        const nb = parseInt(numMatch[0], 10) + code;
        page += String.fromCharCode(nb);
      } catch {
        continue;
      }
    }
    return page || null;
  } catch {
    return null;
  }
}

/**
 * Extract all eval-packed blocks from HTML and return the longest unpacked result
 * (host pages often contain multiple packed scripts; the one with file:"..." is the target)
 */
export function unpackAllBlocks(html: string): string {
  const packedBlocks = [...html.matchAll(/eval\s*\(function\s*\(p,a,c,k[\s\S]*?\)\)\)/g)].map((m) => m[0]);
  if (packedBlocks.length === 0) return html;
  let best = html;
  for (const block of packedBlocks) {
    const unpacked = unpackPacker(block);
    if (unpacked.length > best.length) best = unpacked;
    // Also try replacing the block in html
    if (unpacked !== block) {
      const replaced = html.replace(block, unpacked);
      if (replaced.includes('file"') || replaced.includes("source") || replaced.includes(".m3u8") || replaced.includes(".mp4")) {
        return replaced;
      }
    }
  }
  return best;
}
