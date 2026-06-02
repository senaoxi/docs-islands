# Container Changes Test - Client Visible

This page tests client:visible render containers with lazy hydration.

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

## Initial Content

This is the top of the page. The components below will only hydrate when they become visible.

<div style="height: 800px; padding: 20px; background: #f5f5f5; margin: 20px 0;">
  <h3>Spacer Section</h3>
  <p>This section creates space to test scrolling behavior.</p>
  <p>Scroll down to see the first component...</p>
</div>

## First Component (client:visible)

<HelloWorld client:visible uniqueid="first-component" />

<div style="height: 800px; padding: 20px; background: #e8f4f8; margin: 20px 0;">
  <h3>Another Spacer Section</h3>
  <p>This section creates more space between components.</p>
  <p>Continue scrolling to see the second component...</p>
</div>

## Second Component (client:visible)

<HelloWorld client:visible uniqueid="second-component" />

<div style="height: 400px; padding: 20px; background: #f0f8f0; margin: 20px 0;">
  <h3>End Section</h3>
  <p>You've reached the end of the page.</p>
</div>
