<script>
	import './tables.css';

	/** @type {{ activePlayerCount:number, players:any[], eliminatedPlayers:any[], balanceMessage:string, balanceSuggestions:any[], activePlayers:any[], tableCount:number, tableNames:Record<string,string>, renameTable?: (tableNumber:number, name:string) => void, seatRole: (seat:number) => string, applyBalance: () => void, replacePlayer: (playerId:number, replacementId:number) => void, randomiseSeats: () => void }} */
	let {
		activePlayerCount,
		players,
		eliminatedPlayers,
		balanceMessage,
		balanceSuggestions,
		activePlayers,
		tableCount,
		tableNames = {},
		renameTable,
		seatRole,
		applyBalance,
		replacePlayer,
		randomiseSeats
	} = $props();

	let replacingPlayerId = $state(null);
	let selectedReplacementId = $state('');
	/** @type {number | null} */
	let editingTableNumber = $state(null);
	let tableNameDraft = $state('');

	const visibleTableNumbers = $derived(
		[...new Set(players.filter((player) => Number(player.table) > 0 && Number(player.seat) > 0).map((player) => Number(player.table)))].sort((a, b) => a - b)
	);

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

	/** @param {number} tableNumber */
	function startRename(tableNumber) {
		editingTableNumber = tableNumber;
		tableNameDraft = tableNames[tableNumber] || `Table ${tableNumber}`;
	}

	/** @param {number} tableNumber */
	function saveRename(tableNumber) {
		renameTable?.(tableNumber, tableNameDraft);
		editingTableNumber = null;
		tableNameDraft = '';
	}

	/** @param {any} player */
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

		<div class="table-list-view">
			{#each visibleTableNumbers as tableNumber (tableNumber)}
				{@const tablePlayers = players.filter((player) => player.table === tableNumber && player.seat > 0)}
				{@const seatNumbers = [...new Set(tablePlayers.map((player) => player.seat))].sort((a, b) => a - b)}
				<section class="table-list-card">
					<div class="table-list-heading">
						{#if editingTableNumber === tableNumber}
							<form class="table-rename-form" onsubmit={(event) => { event.preventDefault(); saveRename(tableNumber); }}>
								<input aria-label="Table name" maxlength="32" bind:value={tableNameDraft} />
								<button type="submit">Save</button>
								<button type="button" class="table-rename-cancel" onclick={() => (editingTableNumber = null)}>Cancel</button>
							</form>
						{:else}
							<div class="table-title-group">
								<strong>{tableNames[tableNumber] || `Table ${tableNumber}`}</strong>
								<button class="table-rename-button" type="button" aria-label={`Rename ${tableNames[tableNumber] || `Table ${tableNumber}`}`} title="Rename table" onclick={() => startRename(tableNumber)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg></button>
							</div>
						{/if}
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
									{#if eliminatedPlayer && !seatedPlayer}<small class="eliminated-name">{eliminatedPlayer.name} — eliminated</small>{/if}
								</div>
								{#if eliminatedPlayer && !seatedPlayer}
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
				<select id="replacement-player-select" class="replacement-player-select" style="color-scheme: dark; color: #f0f2f1; background-color: #111519;" bind:value={selectedReplacementId}>
					<option value="" style="color: #f0f2f1; background: #111519;">Select a player</option>
					{#each replacementCandidates as candidate (candidate.id)}
						<option value={candidate.id} style="color: #f0f2f1; background: #111519;">{candidate.name} — {tableNames[candidate.table] || `Table ${candidate.table}`}, Seat {candidate.seat}</option>
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
