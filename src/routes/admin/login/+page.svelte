<script>
	let { data } = $props();
	let password = $state('');
	let error = $state('');
	let loading = $state(false);
	async function submit(event) {
		event.preventDefault();
		loading = true;
		error = '';
		try {
			const response = await fetch('/api/admin/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password })
			});
			const data = await response.json();
			if (!response.ok || !data.ok) throw new Error(data.error || 'Sign-in failed.');
			location.href = '/admin';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Sign-in failed.';
		} finally { loading = false; }
	}
</script>
<svelte:head><title>Admin sign in · Stacks</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<main>{#if !data.configured}<section class="setup"><p class="eyebrow">STACKS / ADMIN</p><h1>Admin password required</h1><p class="muted">Add ADMIN_PASSWORD to your local .env file and to the environment used by the hosted Node server, then rebuild and restart Stacks.</p></section>{:else}<form onsubmit={submit}><p class="eyebrow">STACKS / ADMIN</p><h1>Admin sign in</h1><p class="muted">Enter the administration password to continue.</p><label for="password">Password</label><input id="password" type="password" bind:value={password} autocomplete="current-password" required /><button disabled={loading || !password}>{loading ? 'Signing in…' : 'Sign in'}</button>{#if error}<p class="error">{error}</p>{/if}</form>{/if}</main>
<style>
	:global(body){margin:0;min-height:100vh;background:#101214;color:#f4f4f1;font-family:Inter,ui-sans-serif,system-ui,sans-serif}main{min-height:100vh;display:grid;place-items:center;padding:24px}form,.setup{width:min(420px,100%);padding:32px;border:1px solid #343a40;border-radius:16px;background:#191d21}.eyebrow{font-size:.7rem;letter-spacing:.15em;font-weight:800;color:#c5a15a}h1{margin:10px 0;font-size:2rem;letter-spacing:-.04em}.muted{color:#9ca4ab;line-height:1.5;margin-bottom:26px}label{display:block;color:#b6bec5;font-size:.8rem;margin-bottom:8px}input{width:100%;padding:13px;border:1px solid #414950;border-radius:8px;background:#101214;color:#fff;font:inherit}button{width:100%;margin-top:16px;padding:13px;border:0;border-radius:8px;background:#c5a15a;color:#171717;font-weight:750;font-size:1rem;cursor:pointer}button:disabled{opacity:.5}.error{color:#efaaaa}
</style>
