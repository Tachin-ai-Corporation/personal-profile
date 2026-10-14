# Backend request: `POST /auth/user/logout` should also invalidate the refresh token

**To:** Daniel Garcia / 1h-ng-bo-core-be (auth server, `oauth2` module)
**From:** Personal Profile (NG-9027, Story 1.7)
**Status:** draft, not yet sent
**Date:** 2026-10-13

## Summary

Personal Profile signs the user out by calling `POST <API_ORIGIN>/auth/user/logout` with the session's Bearer access token. Today that invalidates **only the access token**. The session's refresh token stays valid for up to 24 h after logout and can still mint new access tokens. Please make `logout()` invalidate the refresh token of the same authorization too (which, through existing code, also invalidates the access token and authorization code).

## Current behaviour

Paths are under `oauth2/src/main/java/com/sirma/bocore/auth/` (read on `master` at `9a7342252e`).

- `controller/TokenController.java:56`: `POST /user/logout` → `TokenRevocationService.logout(request)`.
- `service/TokenRevocationService.java:189-196`: `logout()` calls `invalidateToken(jwt.getTokenValue())` with the caller's **access token**.
- `service/TokenRevocationService.java:243-261`: `invalidateToken` finds the authorization, then marks only the token it was given as invalidated.
- `service/TokenRevocationService.java:320-339`: `updateTokenValidity` already cascades when the token is a **refresh token**: it also invalidates the access token and any authorization code. Passing an access token has no cascade.
- The public client is registered with `reuseRefreshTokens(false)` and `refreshTokenTimeToLive(24h)` (`config/AuthorizationServerConfig.java:186-191`). So after logout, `grant_type=refresh_token` with the session's refresh token still succeeds and returns a fresh pair.

## Why it matters

- **A logout that isn't one:** after "Return to 1health" the session is still live at 1health for up to 24 h, and it shows up as active.
- **Race exposure:** if a token refresh is in flight when the user logs out, its response can re-seal our cookie with fresh tokens. With this change, a refresh that reaches 1health after the logout gets `invalid_grant` and can't bring the session back. Today it succeeds.
- **No client-side alternative:** we can't revoke the refresh token ourselves. The standard `/oauth2/revoke` needs client authentication, and `public-client` uses `ClientAuthenticationMethod.NONE`.

Risk today is limited, because on our side the refresh token exists only inside a sealed, `HttpOnly` cookie that logout clears. This is a hardening request, not an incident.

## Requested change

In `logout()` only, invalidate the authorization's refresh token when it has one, and fall back to the current behaviour otherwise. Leave `invalidateToken` alone: `revokeToken` and the bulk revoke paths share it.

Sketch, for the backend team to adapt:

```java
@Override
public void logout(HttpServletRequest request) {
    this.assertNotSystemUser();

    Optional.ofNullable(this.getPrincipal()).ifPresent(jwt -> {
        OAuth2Authorization authorization = this.authorizationService.findByToken(jwt.getTokenValue(), null);
        OAuth2Authorization.Token<OAuth2RefreshToken> refreshToken =
                authorization == null ? null : authorization.getRefreshToken();
        if (refreshToken != null) {
            // Invalidating the refresh token also invalidates the access token and any authorization code.
            this.authorizationService.save(this.updateTokenValidity(authorization, refreshToken.getToken(), true));
        } else {
            this.invalidateToken(jwt.getTokenValue());
        }
    });

    this.invalidateSessionAndClearContext(request);
}
```

The sketch uses the authorization's own refresh-token object rather than looking the token up again by value. That avoids depending on how `CustomOAuth2AuthorizationServiceImpl.findByToken` handles hashed token values.

## Acceptance criteria

Take a session issued by the external-application launch exchange (`/v2/public/external-application/auth/oauth2/user/token`), with access token A and refresh token R. After `POST /auth/user/logout` with `Authorization: Bearer A`:

1. API calls with A are rejected with 401, as today.
2. `POST /auth/oauth2/token` with `grant_type=refresh_token`, `refresh_token=R` and `client_id=public-client` returns `invalid_grant`.
3. The user's other sessions (the portal, other devices, other external applications) are unaffected. Only the authorization behind A is touched.
4. A token with no refresh token behaves as today.
5. `/user/logout/all-devices`, `revokeToken` and the bulk revoke paths are unchanged.
6. `TokenRevocationServiceTest` covers cases 1–4.

## Impact

- **Personal Profile:** no change needed. Our logout route already calls `/auth/user/logout` and swallows failures; revoking both tokens is what it intends.
- **Other `/user/logout` callers** (e.g. the portal) would also lose their refresh token on logout. That is the expected meaning of logout, but please confirm no client refreshes after calling it.

## Related question

While you're in this code: is `auth.client-config.public-client-id` left at `public-client` in demo and prod (no environment override)? Our refresh grant hard-codes `client_id=public-client`.
