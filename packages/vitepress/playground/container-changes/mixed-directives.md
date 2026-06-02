# Container Changes Test - Mixed Directives

This page tests mixed render directives for the same component.

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld client:only uniqueid="client-only" />

---

<HelloWorld ssr:only uniqueid="ssr-only" />

---

<HelloWorld client:load uniqueid="client-load" />

---

<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />

<HelloWorld client:visible uniqueid="client-visible" />
