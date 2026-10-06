import { describe, expect, it } from "vitest";
import {
  comHeadersSeguranca,
  ehApi,
  HEADERS_SEGURANCA,
  NOME_INSTANCIA,
  paraBackend,
  rotear,
  variaveisDoContainer,
} from "../src/proxy";

interface Chamadas {
  assets: Request[];
  backend: Request[];
  instancias: string[];
  chavesLimite: string[];
}

function envFalso(limitePermitido = true): { env: Env; chamadas: Chamadas } {
  const chamadas: Chamadas = { assets: [], backend: [], instancias: [], chavesLimite: [] };
  const env = {
    APP_ENV: "prod",
    LOG_LEVEL: "INFO",
    COOKIE_SECURE: "true",
    LLM_PROVIDER: "anthropic",
    EMAIL_BACKEND: "smtp",
    SMTP_PORT: "587",
    SMTP_TLS: "true",
    DATABASE_URL: "postgresql+asyncpg://app:x@db.exemplo:5432/leiloes?ssl=require",
    ANTHROPIC_API_KEY: "chave",
    SMTP_HOST: "smtp.exemplo",
    SMTP_USER: "usuario",
    SMTP_PASSWORD: "senha",
    EMAIL_FROM: "leiloes@exemplo",
    MARKETING_EMAILS: "mkt@exemplo",
    ASSETS: {
      fetch: async (request: Request) => {
        chamadas.assets.push(request);
        return new Response("<html></html>", { headers: { "content-type": "text/html" } });
      },
    },
    BACKEND: {
      getByName: (nome: string) => {
        chamadas.instancias.push(nome);
        return {
          fetch: async (request: Request) => {
            chamadas.backend.push(request);
            return Response.json({ status: "ok" }, { headers: { "set-cookie": "sessao=1" } });
          },
        };
      },
    },
    LOGIN_LIMITER: {
      limit: async ({ key }: { key: string }) => {
        chamadas.chavesLimite.push(key);
        return { success: limitePermitido };
      },
    },
  } as unknown as Env;
  return { env, chamadas };
}

describe("ehApi", () => {
  it("reconhece /api e subrotas", () => {
    expect(ehApi("/api")).toBe(true);
    expect(ehApi("/api/processos")).toBe(true);
  });

  it("nao confunde prefixo parecido nem rota do frontend", () => {
    expect(ehApi("/apis")).toBe(false);
    expect(ehApi("/")).toBe(false);
    expect(ehApi("/processos/1")).toBe(false);
  });
});

describe("comHeadersSeguranca", () => {
  it("adiciona headers de seguranca preservando status, corpo e headers originais", async () => {
    const original = new Response("corpo", { status: 201, headers: { "x-original": "1" } });
    const resposta = comHeadersSeguranca(original);
    expect(resposta.status).toBe(201);
    expect(await resposta.text()).toBe("corpo");
    expect(resposta.headers.get("x-original")).toBe("1");
    for (const [nome, valor] of Object.entries(HEADERS_SEGURANCA)) {
      expect(resposta.headers.get(nome)).toBe(valor);
    }
  });
});

describe("paraBackend", () => {
  it("usa o IP da Cloudflare e ignora X-Forwarded-For forjado pelo cliente", () => {
    const request = new Request("https://leiloes.exemplo/api/auth/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "200.1.2.3", "x-forwarded-for": "6.6.6.6", cookie: "a=1" },
      body: "{}",
    });
    const encaminhada = paraBackend(request);
    expect(encaminhada.headers.get("x-forwarded-for")).toBe("200.1.2.3");
    expect(encaminhada.headers.get("x-forwarded-proto")).toBe("https");
    expect(encaminhada.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(encaminhada.headers.get("cookie")).toBe("a=1");
    expect(encaminhada.method).toBe("POST");
    expect(encaminhada.url).toBe(request.url);
  });
});

describe("variaveisDoContainer", () => {
  it("repassa vars e secrets e usa a URL do app como DATABASE_URL_MIGRATOR", () => {
    const { env } = envFalso();
    const variaveis = variaveisDoContainer(env);
    expect(variaveis.APP_ENV).toBe("prod");
    expect(variaveis.SMTP_PASSWORD).toBe("senha");
    expect(variaveis.ANTHROPIC_API_KEY).toBe("chave");
    expect(variaveis.DATABASE_URL_MIGRATOR).toBe(variaveis.DATABASE_URL);
  });

  it("nao repassa binding nem variavel vazia", () => {
    const { env } = envFalso();
    const variaveis = variaveisDoContainer({ ...env, SMTP_USER: "" } as Env);
    expect(variaveis).not.toHaveProperty("ASSETS");
    expect(variaveis).not.toHaveProperty("BACKEND");
    expect(variaveis).not.toHaveProperty("SMTP_USER");
  });
});

describe("rotear", () => {
  it("serve frontend pelos assets com headers de seguranca", async () => {
    const { env, chamadas } = envFalso();
    const resposta = await rotear(new Request("https://leiloes.exemplo/processos/1"), env);
    expect(chamadas.assets).toHaveLength(1);
    expect(chamadas.backend).toHaveLength(0);
    expect(resposta.headers.get("x-frame-options")).toBe("DENY");
  });

  it("encaminha /api para uma unica instancia do container", async () => {
    const { env, chamadas } = envFalso();
    const resposta = await rotear(
      new Request("https://leiloes.exemplo/api/health", { headers: { "cf-connecting-ip": "1.1.1.1" } }),
      env,
    );
    expect(chamadas.instancias).toEqual([NOME_INSTANCIA]);
    expect(chamadas.backend[0]?.headers.get("x-forwarded-for")).toBe("1.1.1.1");
    expect(resposta.headers.get("set-cookie")).toBe("sessao=1");
    expect(resposta.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("aplica rate limit por IP no POST de login", async () => {
    const { env, chamadas } = envFalso(false);
    const resposta = await rotear(
      new Request("https://leiloes.exemplo/api/auth/login", {
        method: "POST",
        headers: { "cf-connecting-ip": "9.9.9.9" },
        body: "{}",
      }),
      env,
    );
    expect(resposta.status).toBe(429);
    expect(chamadas.chavesLimite).toEqual(["9.9.9.9"]);
    expect(chamadas.backend).toHaveLength(0);
  });

  it("nao aplica rate limit fora do login", async () => {
    const { env, chamadas } = envFalso(false);
    const resposta = await rotear(new Request("https://leiloes.exemplo/api/processos"), env);
    expect(resposta.status).toBe(200);
    expect(chamadas.chavesLimite).toHaveLength(0);
  });
});
