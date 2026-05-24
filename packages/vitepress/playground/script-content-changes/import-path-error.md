# Script Content Changes Test - Import Path Error

This page tests incorrect import path scenarios.

<script lang="react">
  /**
   * Use correct case to ensure path resolution on case-sensitive filesystems (e.g., Linux CI),
   * Vite path resolution is case-insensitive on macOS and Unix-like systems.
   */
  import HelloWorld  from '../components/react/HelloWorld.tsx';
  import HelloWorldWithErrorPath from '../components/react/Helloworldx.tsx';

</script>

<HelloWorldWithErrorPath client:only uniqueid="with-error-path" />

<HelloWorld uniqueid="ssr-only-normal-render" />

<HelloWorld client:only uniqueid="client-only-normal-render" />
