// Microsoft Entra ID sign-in for the ignitemyfire.co.uk tenant.
// The browser uses MSAL with the authorization code flow and PKCE.
// There is no client secret. App roles on the ID token become User, Assessor, or Administrator.

let instance = null;

const LOGIN_SCOPES = ["openid", "profile"];

// True when config.json has a client and tenant id and Entra is switched on.
export function isEntraConfigured(config) {
  return Boolean(config?.entra?.enabled && config.entra.clientId && config.entra.tenantId);
}

// Create the MSAL client, finish any return from login.microsoftonline.com, and restore a cached account.
export async function initAuth(config) {
  if (!isEntraConfigured(config)) return { enabled: false, person: null, error: "", fromRedirect: false };
  if (!window.msal?.PublicClientApplication) {
    return { enabled: true, person: null, error: "Microsoft sign-in could not load. Refresh the page, or check that js/vendor/msal-browser.min.js is present.", fromRedirect: false };
  }

  instance = new window.msal.PublicClientApplication({
    auth: {
      clientId: config.entra.clientId,
      authority: `https://login.microsoftonline.com/${config.entra.tenantId}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
      navigateToLoginRequestUrl: false
    },
    cache: {
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false
    }
  });

  await instance.initialize();

  try {
    const result = await instance.handleRedirectPromise();
    if (result?.account) {
      instance.setActiveAccount(result.account);
      return { ...fromAccount(result.account), fromRedirect: true };
    }
  } catch (error) {
    return { enabled: true, person: null, error: friendlyAuthError(error), fromRedirect: true };
  }

  const cached = instance.getAllAccounts()[0];
  if (cached) {
    instance.setActiveAccount(cached);
    return { ...fromAccount(cached), fromRedirect: false };
  }

  return { enabled: true, person: null, error: "", fromRedirect: false };
}

// Send the browser to Microsoft. This function does not return if the redirect starts.
export async function signInWithEntra() {
  if (!instance) throw new Error("Microsoft sign-in is not ready.");
  await instance.loginRedirect({ scopes: LOGIN_SCOPES, prompt: "select_account" });
}

// End the Microsoft session. Returns true when the browser is leaving the page.
export async function signOutEntra() {
  if (!instance) return false;
  const account = instance.getActiveAccount() || instance.getAllAccounts()[0];
  if (!account) return false;
  await instance.logoutRedirect({
    account,
    postLogoutRedirectUri: window.location.origin
  });
  return true;
}

// Pick the strongest Incident Lab role from the token. Administrator wins if several are present.
function mapRole(roles) {
  const list = Array.isArray(roles) ? roles : [];
  if (list.includes("Administrator")) return "administrator";
  if (list.includes("Assessor")) return "assessor";
  if (list.includes("User")) return "engineer";
  return "";
}

// Turn an MSAL account into a directory person, or an error when no app role is on the token.
function fromAccount(account) {
  const claims = account.idTokenClaims || {};
  const role = mapRole(claims.roles);
  const name = claims.name || claims.preferred_username || "Colleague";
  const email = claims.preferred_username || claims.upn || "";
  if (!role) {
    return {
      enabled: true,
      person: null,
      error: "Your ignitemyfire.co.uk account signed in, but Incident Lab has no role assigned. An administrator must assign User, Assessor, or Administrator on the Incident Lab enterprise application."
    };
  }
  return {
    enabled: true,
    person: {
      id: claims.oid || account.localAccountId,
      name,
      email,
      roleTitle: "",
      role,
      source: "entra"
    },
    error: ""
  };
}

// Short, useful wording for the common first-time Entra errors.
function friendlyAuthError(error) {
  const message = String(error?.message || error || "");
  if (message.includes("AADSTS50011") || message.toLowerCase().includes("redirect_uri")) {
    return "Microsoft rejected the return address. The SPA redirect URI must match this page exactly, including http or https and the port.";
  }
  if (message.includes("AADSTS65001") || message.toLowerCase().includes("consent")) {
    return "A tenant administrator still needs to approve Incident Lab for ignitemyfire.co.uk. Subscription Owner is not enough for that step.";
  }
  if (message.includes("AADSTS50105") || message.toLowerCase().includes("not assigned")) {
    return "This account is not assigned to Incident Lab. An administrator must add it on the enterprise application.";
  }
  return message || "Sign-in did not complete.";
}
