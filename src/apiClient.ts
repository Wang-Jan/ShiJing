const API_BASE_STORAGE_KEY = 'shijing_api_base_url';
const DEFAULT_MOBILE_API_BASE_URL = 'http://121.41.65.197:3000';

const normalizeBaseUrl = (value?: string | null) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/\/+$/, '');
};

const isNativeCapacitor = () => {
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
};

export const getApiBaseUrl = () => {
  const runtimeOverride = normalizeBaseUrl(window.localStorage.getItem(API_BASE_STORAGE_KEY));

  if (runtimeOverride) {
    return runtimeOverride;
  }

  const envBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);

  if (envBaseUrl) {
    return envBaseUrl;
  }

  return isNativeCapacitor() ? DEFAULT_MOBILE_API_BASE_URL : '';
};

export const resolveApiUrl = (url: string) => {
  if (!url.startsWith('/api/')) {
    return url;
  }

  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${url}` : url;
};

export const installApiFetchInterceptor = () => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      return nativeFetch(resolveApiUrl(input), init);
    }

    if (input instanceof URL) {
      return nativeFetch(input, init);
    }

    const requestUrl = input.url.startsWith(window.location.origin)
      ? input.url.slice(window.location.origin.length)
      : input.url;

    if (!requestUrl.startsWith('/api/')) {
      return nativeFetch(input, init);
    }

    return nativeFetch(new Request(resolveApiUrl(requestUrl), input), init);
  };
};

export const isLikelyNetworkError = (error: unknown) => {
  if (!navigator.onLine) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /failed to fetch|fetch failed|network|load failed|无法连接|连接失败/i.test(error.message);
};
