const axios = require('axios');

const MAX_RETRY_AFTER = 300; // seconds
const MAX_NETWORK_RETRIES = 5;
const REQUEST_TIMEOUT = 60 * 1000; // ms

// Errors worth retrying: the connection dropped or timed out, or the server failed
const TRANSIENT_CODES = ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND'];
const isTransient = ({ code, response }) =>
  TRANSIENT_CODES.includes(code) || (response?.status >= 500 && response?.status < 600);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const figmaRestApi = axios.create({
  baseURL: process.env.FIGMA_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'X-Figma-Token': process.env.DEV_ACCESS_TOKEN
  }
});

// Downloads of the rendered SVGs (S3 URLs returned by the images endpoint), no Figma token
const downloadClient = axios.create({ timeout: REQUEST_TIMEOUT });

// Extract relevant Figma headers for logging
const getFigmaHeaders = (headers) => {
  if (!headers) return {};
  const relevant = ['x-figma-rest-api-request-id', 'x-figma-plan-tier', 'x-figma-rate-limit-type', 'retry-after'];
  return Object.fromEntries(
    relevant.filter(key => headers[key]).map(key => [key, headers[key]])
  );
};

// Log request error with context
const logRequestError = (error) => {
  const { config, response } = error;
  console.error('Figma API request failed:', {
    method: config?.method?.toUpperCase(),
    url: config?.url,
    status: response?.status,
    statusText: response?.statusText,
    figmaHeaders: getFigmaHeaders(response?.headers)
  });
};

// Log all requests before they're sent
figmaRestApi.interceptors.request.use((config) => {
  console.log(`Figma API: ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

// Retries a request on a rate limit (Figma's retry-after) or a transient failure (backoff)
const retryInterceptor = (client) => async (error) => {
  const { response, config } = error;
  if (!config) {
    return Promise.reject(error);
  }

  // Handle 429 with retry-after
  if (response?.status === 429) {
    const retryAfter = parseInt(response.headers['retry-after'], 10);

    if (retryAfter && retryAfter < MAX_RETRY_AFTER) {
      console.log(`Rate limited (${config.method?.toUpperCase()} ${config.url}). Waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      return client.request(config);
    }
  }

  // One dropped connection must not fail the whole export
  config.networkRetries = config.networkRetries ?? 0;
  if (isTransient(error) && config.networkRetries < MAX_NETWORK_RETRIES) {
    config.networkRetries += 1;
    const delay = 2 ** config.networkRetries * 500;
    console.log(`${error.code ?? response?.status} (${config.method?.toUpperCase()} ${config.url}). Retry ${config.networkRetries}/${MAX_NETWORK_RETRIES} in ${delay}ms...`);
    await sleep(delay);
    return client.request(config);
  }

  // Log error details before rejecting
  logRequestError(error);
  return Promise.reject(error);
};

figmaRestApi.interceptors.response.use((response) => response, retryInterceptor(figmaRestApi));
downloadClient.interceptors.response.use((response) => response, retryInterceptor(downloadClient));

module.exports = figmaRestApi;
module.exports.downloadClient = downloadClient;
