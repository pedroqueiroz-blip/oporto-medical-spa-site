// Armazenamento: Netlify Blobs em produção; pasta local quando LOCAL_BLOBS_DIR está definida (testes).
import { promises as fs } from "node:fs";
import path from "node:path";

const local = () => process.env.LOCAL_BLOBS_DIR;

class FileStore {
  constructor(name) { this.dir = path.join(local(), name); }
  f(key) { return path.join(this.dir, encodeURIComponent(key)); }
  async get(key, opts = {}) {
    try {
      const buf = await fs.readFile(this.f(key));
      if (opts.type === "json") return JSON.parse(buf.toString("utf8"));
      if (opts.type === "arrayBuffer") return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return buf.toString("utf8");
    } catch { return null; }
  }
  async getWithMetadata(key, opts = {}) {
    const data = await this.get(key, opts);
    if (data == null) return null;
    let metadata = {};
    try { metadata = JSON.parse(await fs.readFile(this.f(key) + ".meta", "utf8")); } catch {}
    return { data, metadata };
  }
  async set(key, value, opts = {}) {
    await fs.mkdir(this.dir, { recursive: true });
    const buf = value instanceof ArrayBuffer ? Buffer.from(value) : Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    await fs.writeFile(this.f(key), buf);
    if (opts.metadata) await fs.writeFile(this.f(key) + ".meta", JSON.stringify(opts.metadata));
  }
  async setJSON(key, value, opts) { return this.set(key, JSON.stringify(value), opts); }
  async delete(key) { await fs.rm(this.f(key), { force: true }); await fs.rm(this.f(key) + ".meta", { force: true }); }
  async list({ prefix = "" } = {}) {
    let files = [];
    try { files = await fs.readdir(this.dir); } catch {}
    const blobs = files.filter((f) => !f.endsWith(".meta")).map((f) => ({ key: decodeURIComponent(f) }))
      .filter((b) => b.key.startsWith(prefix));
    return { blobs };
  }
}

const cache = new Map();

export async function store(name) {
  if (cache.has(name)) return cache.get(name);
  let s;
  if (local()) s = new FileStore(name);
  else {
    const { getStore } = await import("@netlify/blobs");
    s = getStore({ name, consistency: "strong" });
  }
  cache.set(name, s);
  return s;
}

// Nomes das "gavetas" de dados
export const STORES = {
  pedidos: "pedidos",   // marcações e vouchers comprados
  codigos: "codigos",   // vouchers emitidos e códigos de 10% da newsletter
  verificacoes: "verificacoes", // códigos de verificação do email antes da marcação
};
