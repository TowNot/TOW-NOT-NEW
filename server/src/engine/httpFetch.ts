import { Agent, ProxyAgent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

/** Shared keep-alive pool for outbound scraper / API polling. */
const keepAliveAgent = new Agent({
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 600_000,
  connections: 128,
  pipelining: 1,
});

const proxyAgents = new Map<string, ProxyAgent>();

export function getKeepAliveAgent(): Agent {
  return keepAliveAgent;
}

/** Proxy dispatcher with keep-alive for residential proxy routes. */
export function getProxyAgent(proxyUrl: string): ProxyAgent {
  const existing = proxyAgents.get(proxyUrl);
  if (existing) return existing;
  const agent = new ProxyAgent({
    uri: proxyUrl,
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 600_000,
    connections: 64,
    pipelining: 1,
  });
  proxyAgents.set(proxyUrl, agent);
  return agent;
}

type FetchInit = Omit<RequestInit, "dispatcher"> & {
  dispatcher?: UndiciRequestInit["dispatcher"];
};

/**
 * undici fetch with a persistent connection pool. Pass `dispatcher` to override
 * (e.g. ProxyAgent); otherwise uses the shared keep-alive Agent.
 */
export async function keepAliveFetch(url: string, init: FetchInit = {}): Promise<Response> {
  const { dispatcher, ...rest } = init;
  const res = await undiciFetch(url, {
    ...(rest as UndiciRequestInit),
    dispatcher: dispatcher ?? keepAliveAgent,
  });
  return res as unknown as Response;
}
