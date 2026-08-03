export const getPasswordRecoveryRedirectUrl = (
  baseUrl: string,
  currentUrl: string,
) => {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const redirectUrl = new URL(normalizedBaseUrl, currentUrl);
  redirectUrl.hash = "/set-password";

  return redirectUrl.toString();
};

const getNonEmptyCode = (search: string) =>
  new URLSearchParams(search).get("code")?.trim() || null;

export const getPasswordRecoveryCode = (
  routerSearch: string,
  topLevelSearch: string,
) => getNonEmptyCode(routerSearch) ?? getNonEmptyCode(topLevelSearch);

export const removeTopLevelRecoveryCode = (currentUrl: string) => {
  const cleanedUrl = new URL(currentUrl);
  cleanedUrl.searchParams.delete("code");

  return cleanedUrl.toString();
};
