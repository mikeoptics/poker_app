<script>
	import './tables.css';

	let {
		activePlayerCount,
		players,
		eliminatedPlayers,
		balanceMessage,
		balanceSuggestions,
		activePlayers,
		tableCount,
		seatRole,
		applyBalance,
		replacePlayer,
		randomiseSeats
	} = $props();

	let replacingPlayerId = $state(null);
	let selectedReplacementId = $state('');

	const replacingPlayer = $derived(
		players.find((player) => player.id === replacingPlayerId && player.eliminated) ?? null
	);
	const replacementCandidates = $derived(
		replacingPlayer
			? activePlayers
				.filter((player) => player.table !== replacingPlayer.table)
				.sort((a, b) => a.table - b.table || a.seat - b.seat)
			: []
	);

	function openReplace(player) {
		replacingPlayerId = player.id;
		selectedReplacementId = '';
	}

	function confirmReplacement() {
		const replacementId = Number(selectedReplacementId);
		if (!replacingPlayer || !replacementId) return;
		replacePlayer(replacingPlayer.id, replacementId);
		replacingPlayerId = null;
		selectedReplacementId = '';
	}
</script>

<section class="tables-page">
	<div class="tables-panel">
		<div class="panel-heading">
			<div><h2>Tables</h2></div>
			<span class="player-count">
				{activePlayerCount} players
				{#if eliminatedPlayers.length} · {eliminatedPlayers.length} eliminated{/if}
			</span>
			<button class="randomise-seating" type="button" onclick={randomiseSeats}>Randomise seating</button>
		</div>

		{#if balanceMessage}
			<div class="balance-alert">
				<strong>{balanceMessage}</strong>
				{#if balanceSuggestions.length}
					<div class="balance-list">
						{#each balanceSuggestions as move}
							<div><span>{move.name}</span><b>Table {move.from} → Table {move.to}, Seat {move.seat}</b></div>
						{/each}
					</div>
					<button class="apply-balance" onclick={() => applyBalance(balanceSuggestions[0])}>Apply balance</button>
				{/if}
			</div>
		{/if}

		<div class="table-list-view">
			{#each Array(tableCount) as _, ti}
				{@const tableNumber = ti + 1}
				{@const tablePlayers = players.filter((player) => player.table === tableNumber && player.seat > 0)}
				{@const seatNumbers = [...new Set(tablePlayers.map((player) => player.seat))].sort((a, b) => a - b)}
				<section class="table-list-card">
					<div class="table-list-heading">
						<strong>Table {tableNumber}</strong>
						<span>{tablePlayers.filter((player) => !player.eliminated).length} / 8 players</span>
					</div>
					<div class="table-list-header">
						<span>Seat</span><span>Position</span><span>Player</span>
					</div>
					{#each seatNumbers as seat}
						{@const seatPlayers = tablePlayers.filter((player) => player.seat === seat)}
						{@const seatedPlayer = seatPlayers.find((player) => !player.eliminated)}
						{@const eliminatedPlayer = seatPlayers.find((player) => player.eliminated)}
						<div class="table-list-row" class:eliminated-seat={!seatedPlayer && Boolean(eliminatedPlayer)}>
							<strong>{seat}</strong>
							<span>{seatRole(seat)}</span>
							<div class="table-player-name">
								<div class="seat-player-labels">
									{#if seatedPlayer}<b>{seatedPlayer.name}</b>{/if}
									{#if eliminatedPlayer}<small class="eliminated-name">{eliminatedPlayer.name} — eliminated</small>{/if}
								</div>
								{#if eliminatedPlayer}
									<button class="replace-seat-button" type="button" onclick={() => openReplace(eliminatedPlayer)}>Replace</button>
								{/if}
							</div>
						</div>
					{/each}
				</section>
			{/each}
		</div>
	</div>
</section>

{#if replacingPlayer}
	<div class="replace-modal-backdrop" role="presentation" onclick={(event) => {
		if (event.target === event.currentTarget) replacingPlayerId = null;
	}}>
		<section class="replace-modal" role="dialog" aria-modal="true" aria-labelledby="replace-modal-title">
			<div class="replace-modal-heading">
				<div>
					<span class="replace-modal-eyebrow">TABLE {replacingPlayer.table} · SEAT {replacingPlayer.seat}</span>
					<h2 id="replace-modal-title">Replace {replacingPlayer.name}</h2>
				</div>
				<button class="replace-modal-close" type="button" aria-label="Close" onclick={() => (replacingPlayerId = null)}>×</button>
			</div>
			<p>Select an active player from another table to move into this seat.</p>
			{#if replacementCandidates.length}
				<label for="replacement-player-select">Player to move</label>
				<select id="replacement-player-select" class="replacement-player-select" style="color-scheme: dark; color: #f0f2f1; background-color: #111519;" value={selectedReplacementId} onchange={(event) => (selectedReplacementId = event.currentTarget.value)}>
					<option value="" style="color: #f0f2f1; background: #111519;">Select a player</option>
					{#each replacementCandidates as candidate (candidate.id)}
						<option value={candidate.id} style="color: #f0f2f1; background: #111519;">{candidate.name} — Table {candidate.table}, Seat {candidate.seat}</option>
					{/each}
				</select>
			{:else}
				<p class="replace-no-candidates">There are no active players at another table to move here.</p>
			{/if}
			<div class="replace-modal-actions">
				<button class="replace-cancel" type="button" onclick={() => (replacingPlayerId = null)}>Cancel</button>
				<button class="replace-confirm" type="button" disabled={!selectedReplacementId || !replacementCandidates.some((player) => player.id === Number(selectedReplacementId))} onclick={confirmReplacement}>Move player</button>
			</div>
		</section>
	</div>
{/if}
