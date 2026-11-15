import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export interface AzureOpenAIOptions {
  /** Resource endpoint, e.g. https://my-resource.openai.azure.com */
  endpoint: string;
  apiKey: string;
  /** Deployment names. In Azure OpenAI the deployment name is what the API calls the model. */
  deployments: string[];
}

/** Azure OpenAI's v1 API is OpenAI-compatible under /openai/v1 and authenticates with an api-key header. */
export function azureOpenAIBaseUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}/openai/v1`;
}

export class AzureOpenAIProvider extends OpenAICompatibleProvider {
  constructor(options: AzureOpenAIOptions) {
    if (options.deployments.length === 0) {
      throw new Error("Azure OpenAI needs at least one chat deployment name.");
    }

    super({
      providerId: "azure-openai",
      baseUrl: azureOpenAIBaseUrl(options.endpoint),
      defaultModel: options.deployments[0]!,
      catalog: options.deployments,
      headers: { "api-key": options.apiKey }
    });
  }
}
