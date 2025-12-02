const axios = require('axios');

const MAX_RETRY_AFTER = 300; // seconds

const figmaRestApi = axios.create({
  baseURL: process.env.FIGMA_BASE_URL,
  headers: {
    'X-Figma-Token': process.env.DEV_ACCESS_TOKEN
  }
});

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

figmaRestApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    // Handle 429 with retry-after
    if (response?.status === 429) {
      const retryAfter = parseInt(response.headers['retry-after'], 10);

      if (retryAfter && retryAfter < MAX_RETRY_AFTER) {
        console.log(`Rate limited (${config?.method?.toUpperCase()} ${config?.url}). Waiting ${retryAfter}s...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return figmaRestApi.request(config);
      }
    }

    // Log error details before rejecting
    logRequestError(error);
    return Promise.reject(error);
  }
);

module.exports = figmaRestApi;
