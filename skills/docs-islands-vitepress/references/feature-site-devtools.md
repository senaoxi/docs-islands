# Site DevTools

Use Site DevTools after the base integration works and runtime evidence is needed.

## When to Open It

- A component flickers during VitePress SPA navigation.
- Hydration or render state differs from expectations.
- HMR becomes noisy or slow.
- Page bundle cost unexpectedly grows.
- A teammate or issue needs a shareable runtime snapshot.

## Mounting

Mount `SiteDevToolsConsole` in the theme layout and import `@docs-islands/vitepress/devtools/client/style.css`. See [Theme](config-theme.md) for the complete layout example.

Enable the console with:

```text
?site-devtools=1
```

Disable it with:

```text
?site-devtools=0
```

## Runtime Surfaces

| Surface                 | Use for                                                    |
| ----------------------- | ---------------------------------------------------------- |
| Overlay/component state | Render directive, status, visibility wait, bundle relation |
| Debug Logs              | Runtime events, HMR stages, render errors                  |
| Render Metrics          | Component render mode, timing, SPA sync participation      |
| HMR Metrics             | Trigger/apply/runtime-ready timing                         |
| Reports                 | Optional build-time AI page reports                        |

## Browser Console Helper

```js
globalThis.__DOCS_ISLANDS_SITE_DEVTOOLS__;
```

Useful methods:

| Method                | Purpose                                 |
| --------------------- | --------------------------------------- |
| `getEntries()`        | Read debug log entries                  |
| `getGlobal(path?)`    | Inspect injected runtime globals        |
| `getRenderMetrics()`  | Read render metrics                     |
| `getHmrMetrics()`     | Read HMR metrics                        |
| `logRuntime(reason?)` | Push a runtime snapshot into debug logs |
| `snapshotRuntime()`   | Return a runtime snapshot object        |

## Optional UI Dependencies

| Dependency        | Enhancement                          | Fallback             |
| ----------------- | ------------------------------------ | -------------------- |
| `vue-json-pretty` | Tree view for JSON/runtime snapshots | Plain readable JSON  |
| `prettier`        | Source preview formatting            | Original source text |
| `shiki`           | Syntax highlighting                  | Plain-text preview   |

Build-time AI reports require `siteDevtools.analysis`; the runtime console itself does not.
