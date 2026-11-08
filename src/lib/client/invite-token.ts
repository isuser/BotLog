/**
 * Invite links carry their token in the fragment (`/invite#<token>`), which never reaches the
 * server. Sign-in in between (password or Google) loses the fragment, so it waits in this
 * tab's sessionStorage until the join page uses it.
 */
const KEY = "botlog-invite-token";

/** Keeps a token from the address bar's fragment, and takes it out of the address bar. */
export function rememberInviteToken() {
  const fromHash = window.location.hash.slice(1);
  if (!fromHash) return;
  sessionStorage.setItem(KEY, fromHash);
  history.replaceState(history.state, "", window.location.pathname + window.location.search);
}

export function inviteToken(): string | null {
  rememberInviteToken();
  return sessionStorage.getItem(KEY);
}

export const forgetInviteToken = () => sessionStorage.removeItem(KEY);
