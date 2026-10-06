export const HEADERS_SEGURANCA: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'",
};

export const ROTA_LOGIN = "/api/auth/login";
export const NOME_INSTANCIA = "principal";

const VARIAVEIS_CONTAINER = [
  "APP_ENV",
  "LOG_LEVEL",
  "COOKIE_SECURE",
  "LLM_PROVIDER",
  "EMAIL_BACKEND",
  "SMTP_PORT",
  "SMTP_TLS",
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM",
  "MARKETING_EMAILS",
] as const satisfies readonly (keyof Env)[];

export function ehApi(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function ipCliente(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "desconhecido";
}

export function comHeadersSeguranca(resposta: Response): Response {
  const nova = new Response(resposta.body, resposta);
  for (const [nome, valor] of Object.entries(HEADERS_SEGURANCA)) {
    nova.headers.set(nome, valor);
  }
  return nova;
}

export function paraBackend(request: Request): Request {
  const encaminhada = new Request(request);
  encaminhada.headers.set("x-forwarded-for", ipCliente(request));
  encaminhada.headers.set("x-forwarded-proto", "https");
  encaminhada.headers.set("x-request-id", crypto.randomUUID());
  return encaminhada;
}

export function variaveisDoContainer(env: Env): Record<string, string> {
  const variaveis: Record<string, string> = {};
  for (const nome of VARIAVEIS_CONTAINER) {
    const valor = env[nome];
    if (valor) {
      variaveis[nome] = valor;
    }
  }
  if (variaveis.DATABASE_URL) {
    variaveis.DATABASE_URL_MIGRATOR = variaveis.DATABASE_URL;
  }
  return variaveis;
}

export async function rotear(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (!ehApi(pathname)) {
    return comHeadersSeguranca(await env.ASSETS.fetch(request));
  }
  if (pathname === ROTA_LOGIN && request.method === "POST") {
    const { success } = await env.LOGIN_LIMITER.limit({ key: ipCliente(request) });
    if (!success) {
      return comHeadersSeguranca(
        Response.json({ detail: "Muitas tentativas. Aguarde um minuto." }, { status: 429 }),
      );
    }
  }
  const backend = env.BACKEND.getByName(NOME_INSTANCIA);
  return comHeadersSeguranca(await backend.fetch(paraBackend(request)));
}
