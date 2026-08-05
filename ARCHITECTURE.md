# AorType — Architecture & Mobile Build SSOT

This document is the single source of truth for how AorType works. Any AI or developer reading this should be able to make changes without repeating past mistakes.

---

## Stack Overview

| Layer | Technology | Where it runs |
|---|---|---|
| Backend API | Node.js + Express (`server.js`) | Vercel (auto-deploy from `main`) |
| Web frontend | Vanilla HTML/CSS/JS (`index.html`) | Served by Express at `/`, also on Vercel |
| iOS app | Capacitor 8 wrapping a WKWebView | Built by Codemagic → TestFlight |
| Database | Supabase (PostgreSQL) | Supabase cloud |
| AI features | Google Generative AI (Gemini) | Server-side in `server.js` |

**Critical detail**: `capacitor.config.json` sets `server.url: "https://aortype.com"`. This means the iOS WKWebView loads the **live production website**, not a local bundle. Every change to `index.html` or `server.js` that's pushed to `main` and deployed to Vercel is **immediately live in the iOS app** without a new Codemagic build — except for native Capacitor plugin changes, Info.plist changes, entitlements, and build number bumps, which require a new Codemagic build.

---

## Deployment Model

```
git push → main
  ↓
Vercel auto-deploys server.js + index.html → https://aortype.com
  ↓ (live immediately in iOS WKWebView via server.url)

Codemagic build (manual trigger)
  ↓
npm install → npx cap sync → Xcode archive → IPA
  ↓
TestFlight → App Store
```

**When to trigger Codemagic**: only when native iOS files change:
- `ios/` directory (Xcode project, Info.plist, entitlements, Podfile)
- `capacitor.config.json`
- `package.json` (adding/removing Capacitor plugins)
- Build number bump (`CURRENT_PROJECT_VERSION` in `project.pbxproj`)

---

## Authentication Architecture

### Web (browser / Safari)
- **Google**: Google Identity Services (GIS) popup via `window.open()`
- **Apple**: Server-side OAuth popup via `window.open()` to `/api/auth/apple/start`
  - Apple posts back to `/api/auth/apple/callback` (form_post)
  - Server sends `postMessage` to opener window with JWT token

### iOS (WKWebView / Capacitor)
WKWebView **blocks** `window.open()` popups and Google intentionally **blocks** GIS in embedded WebViews. Both sign-in flows use `@capacitor/browser` (SFSafariViewController) + server-side OAuth + deep link callback.

#### Google Sign In on iOS
1. JS detects `window.Capacitor.isNativePlatform() === true`
2. Opens `https://aortype.com/api/auth/google/start` via `Browser.open()`
3. Server redirects → Google OAuth → `/api/auth/google/callback`
4. Server builds JWT, redirects to `aortype://auth?token=JWT&...`
5. iOS receives deep link → `App.addListener('appUrlOpen')` fires
6. JS parses URL params, calls `AUTH.setToken(token)` + `completeSocialLogin()`

#### Apple Sign In on iOS
Same pattern as Google:
1. JS detects `window.Capacitor.isNativePlatform() === true`
2. Opens `https://aortype.com/api/auth/apple/start?platform=ios` via `Browser.open()`
3. Server sets `state` prefixed with `ios_` to detect platform
4. Apple posts to `/api/auth/apple/callback` (form_post)
5. Server detects `ios_` prefix → redirects to `aortype://auth?token=JWT&...`
6. iOS receives deep link → `App.addListener('appUrlOpen')` fires
7. JS parses URL params, calls `AUTH.setToken(token)` + `completeSocialLogin()`

**DO NOT use `@capacitor-community/apple-sign-in`** — v1.0.1 is designed for Capacitor 3/4 and does not register with Capacitor 8. `window.Capacitor.Plugins.SignInWithApple` will be `undefined`.

---

## Deep Link Setup

### URL Scheme: `aortype://`

Registered in `ios/App/App/Info.plist`:
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array><string>aortype</string></array>
        <key>CFBundleURLName</key>
        <string>com.aortype.app</string>
    </dict>
</array>
```

Capacitor's `ApplicationDelegateProxy` handles URL opening automatically. JS listens:
```javascript
App.addListener('appUrlOpen', async (data) => { /* data.url = "aortype://auth?token=..." */ })
```

The listener must be added **before** opening the browser, and removed after handling (call `listener.remove()`).

---

## Capacitor Plugin Usage

| Plugin | Package | Purpose |
|---|---|---|
| `@capacitor/browser` | `^6.0.3` | Opens SFSafariViewController for OAuth (iOS) |
| `@capacitor/app` | `^6.0.2` | Deep link listener (`appUrlOpen` event) |

Access in JS: `window.Capacitor.Plugins.Browser` and `window.Capacitor.Plugins.App`.

**Plugin version conflict**: `@capacitor/app@6.x` and `@capacitor/browser@6.x` declare peer dep `@capacitor/core@^6.x`, but the project uses `@capacitor/core@^8.x`. Fix is in `package.json`:
```json
"overrides": { "@capacitor/core": "^8.4.1" }
```
Also keep `.npmrc` with `legacy-peer-deps=true` for compatibility.

---

## iOS Native Configuration

### Build Number
`CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` (appears twice: Debug + Release).  
**Must increment for every TestFlight upload.** App Store Connect rejects builds with the same or lower build number.

History:
- Build 1: initial
- Build 2: Google OAuth deep link
- Build 3: Apple entitlements + `ITSAppUsesNonExemptEncryption`
- Build 4: Apple Sign In Browser flow + register scroll fix

### Entitlements (`ios/App/App/App.entitlements`)
```xml
<key>com.apple.developer.applesignin</key>
<array><string>Default</string></array>
```
Referenced in `project.pbxproj` as `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` in both Debug and Release build configurations.

### Export Compliance (`Info.plist`)
```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```
Without this, Codemagic uploads succeed but App Store Connect requires manual export compliance selection before the build becomes available to testers.

### Safe Area & Scroll
The auth screen uses `absolute inset-0 flex flex-col overflow-hidden`. The inner scroll area is `flex-1 overflow-y-auto`. Form containers inside the scroll area must **not** use `flex-1` if they contain more content than fits on screen — `flex-1` prevents scrolling because the flex child shrinks to fill the space. Use content-sized `flex flex-col` with adequate `pb-24` bottom padding.

---

## Server-Side OAuth Endpoints

### Google
- `GET /api/auth/google/start` → redirects to Google OAuth
- `GET /api/auth/google/callback` → receives code, exchanges for token, creates/finds user, redirects to:
  - `aortype://auth?token=JWT` (iOS, detected by `state` param)
  - postMessage to opener (web)

Required env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`  
Google Cloud Console: add `https://aortype.com/api/auth/google/callback` as authorized redirect URI.

### Apple
- `GET /api/auth/apple/start` → accepts `?platform=ios`, redirects to Apple OAuth
  - Sets `state = 'ios_' + random` for iOS, or just random for web
- `POST /api/auth/apple/callback` → Apple posts here (form_post)
  - Detects `ios_` prefix in `state` → redirects to `aortype://auth?token=JWT&...`
  - Otherwise → `postMessage` to opener (web)

Required env vars: `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`  
Apple Developer Portal: Services ID `com.aortype.web` must have `https://aortype.com/api/auth/apple/callback` as Return URL.  
App ID `com.aortype.app` must have "Sign In with Apple" capability enabled.

---

## Environment Variables (Vercel)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `APPLE_CLIENT_ID` | Apple Services ID (e.g. `com.aortype.web`) |
| `APPLE_TEAM_ID` | Apple developer Team ID |
| `APPLE_KEY_ID` | Apple Sign In key ID |
| `APPLE_PRIVATE_KEY` | Apple Sign In private key (`.p8` contents) |
| `GEMINI_API_KEY` | Google Gemini API key |

---

## Common Mistakes to Avoid

1. **Never use `@capacitor-community/apple-sign-in`** — incompatible with Capacitor 8.
2. **Never use `window.open()` for OAuth on iOS** — WKWebView blocks popups.
3. **Never use Google GIS (`google.accounts.id.initialize`) on iOS** — Google blocks it in embedded WebViews. Use server-side OAuth.
4. **Always bump `CURRENT_PROJECT_VERSION`** before a Codemagic build that goes to TestFlight.
5. **`flex-1` inside `overflow-y-auto` prevents scrolling** — size form containers by content, not flex growth.
6. **`ITSAppUsesNonExemptEncryption`** must be in `Info.plist` or every build needs manual export compliance in App Store Connect.
7. **`npm overrides` is required** — without it, Vercel build fails with ERESOLVE peer dep conflict.
8. **Deep link listener must be registered before `Browser.open()`** — add the `appUrlOpen` listener first, then open the browser.
9. **Apple callback is `form_post`** — the callback endpoint must be `POST`, not `GET`.
10. **`App.addListener` returns a handle** — always call `handle.remove()` after handling the deep link to avoid memory leaks and duplicate handling.
