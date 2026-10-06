import { DurableObject } from "cloudflare:workers";
import { rotear, variaveisDoContainer } from "./proxy";

const PORTA = 8000;
const INATIVIDADE_MS = 2 * 60 * 60 * 1000;
const TENTATIVAS_PRONTIDAO = 300;
const INTERVALO_PRONTIDAO_MS = 200;

export class Backend extends DurableObject<Env> {
  private iniciando: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(INATIVIDADE_MS));
    }
  }

  override async fetch(request: Request): Promise<Response> {
    this.iniciando ??= this.iniciarEAguardar().finally(() => {
      this.iniciando = undefined;
    });
    await this.iniciando;

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const encaminhada = new Request(url, request);
    encaminhada.headers.delete("host");
    return this.container().getTcpPort(PORTA).fetch(encaminhada);
  }

  private container(): Container {
    const container = this.ctx.container;
    if (!container) {
      throw new Error("Durable Object sem container configurado");
    }
    return container;
  }

  private async iniciarEAguardar(): Promise<void> {
    const container = this.container();
    if (!container.running) {
      const imagem = container.images.base;
      if (!imagem) {
        throw new Error("Imagem base do container nao configurada");
      }
      container.start({
        image: imagem,
        instance: "standard-1",
        enableInternet: true,
        env: variaveisDoContainer(this.env),
      });
    }
    await container.setInactivityTimeout(INATIVIDADE_MS);

    const porta = container.getTcpPort(PORTA);
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa < TENTATIVAS_PRONTIDAO; tentativa++) {
      try {
        const resposta = await porta.fetch("http://container/api/health", {
          signal: AbortSignal.timeout(1000),
        });
        await resposta.body?.cancel();
        return;
      } catch (erro) {
        ultimoErro = erro;
        await scheduler.wait(INTERVALO_PRONTIDAO_MS);
      }
    }
    throw new Error(`Container nao respondeu na porta ${PORTA}`, { cause: ultimoErro });
  }
}

export default {
  fetch: (request, env) => rotear(request, env),
} satisfies ExportedHandler<Env>;
