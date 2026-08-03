export const getSignUpRedirectUrl = (baseUrl: string, currentUrl: string) => {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const deploymentBaseUrl = new URL(normalizedBaseUrl, currentUrl);

  deploymentBaseUrl.search = "";
  deploymentBaseUrl.hash = "";

  return new URL("auth-callback.html", deploymentBaseUrl).toString();
};
