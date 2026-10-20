import { expect, test } from "vitest";
import { googleSignInEnabled, oauthErrorCode, signInErrorMessage } from "./google";

test("Google sign-in is off unless GOOGLE_SIGN_IN is true", () => {
  expect(googleSignInEnabled("true")).toBe(true);
  expect(googleSignInEnabled(" TRUE ")).toBe(true);
  for (const raw of [undefined, "", "false", "1", "yes"]) expect(googleSignInEnabled(raw)).toBe(false);
});

test("a Google account without a Botlog user gets its own message", () => {
  expect(oauthErrorCode("Signups not allowed for this instance")).toBe("no_account");
  expect(oauthErrorCode("Unable to exchange external code")).toBe("oauth");
  expect(oauthErrorCode(null)).toBe("oauth");
});

test("only known error codes show a message", () => {
  expect(signInErrorMessage("no_account")).toMatch(/no Botlog account/);
  for (const code of [null, "", "nope", "constructor", "__proto__", "toString"]) {
    expect(signInErrorMessage(code)).toBeNull();
  }
});
