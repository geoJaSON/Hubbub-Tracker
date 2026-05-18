import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

let _getToken: (() => Promise<string | null>) | null = null;

export function initApiClient(getToken: () => Promise<string | null>) {
  _getToken = getToken;
  setAuthTokenGetter(async () => {
    if (!_getToken) return null;
    return _getToken();
  });
  setBaseUrl(null);
}
