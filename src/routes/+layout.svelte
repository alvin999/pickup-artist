<script lang="ts">
	import './layout.css';
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/favicon-32x32.png" />
</svelte:head>

{@render children?.()}
