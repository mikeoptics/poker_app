<script>
	import './tables.css';

	/** @type {{ activePlayerCount:number, players:any[], eliminatedPlayers:any[], balanceMessage:string, balanceSuggestions:any[], activePlayers:any[], tableCount:number, tableNames:Record<string,string>, venueName?:string, renameTable?: (tableNumber:number, name:string) => void, seatRole: (seat:number) => string, applyBalance: () => void, replacePlayer: (playerId:number, replacementId:number) => void, randomiseSeats: () => void }} */
	let {
		activePlayerCount,
		players,
		eliminatedPlayers,
		balanceMessage,
		balanceSuggestions,
		activePlayers,
		tableCount,
		tableNames = {},
		venueName = 'Poker tournament',
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
	let sharingSeatingPlan = $state(false);
	let shareStatus = $state('');

	const tableGroups = $derived.by(() => {
		/** @type {Map<number, { number:number, activePlayers:any[], seats:Map<number, { number:number, players:any[] }> }>} */
		const grouped = new Map();

		for (const player of players) {
			const tableNumber = Number(player.table);
			const seatNumber = Number(player.seat);
			if (!(tableNumber > 0 && seatNumber > 0)) continue;

			let table = grouped.get(tableNumber);
			if (!table) {
				table = { number: tableNumber, activePlayers: [], seats: new Map() };
				grouped.set(tableNumber, table);
			}

			if (!player.eliminated) table.activePlayers.push(player);

			let seat = table.seats.get(seatNumber);
			if (!seat) {
				seat = { number: seatNumber, players: [] };
				table.seats.set(seatNumber, seat);
			}
			seat.players.push(player);
		}

		return [...grouped.values()]
			.sort((a, b) => a.number - b.number)
			.map((table) => ({
				...table,
				activeCount: table.activePlayers.length,
				activePlayers: table.activePlayers.sort((a, b) => Number(a.seat) - Number(b.seat)),
				seats: [...table.seats.values()]
					.sort((a, b) => a.number - b.number)
					.map((seat) => ({
						...seat,
						seatedPlayer: seat.players.find((player) => !player.eliminated),
						eliminatedPlayer: seat.players.find((player) => player.eliminated)
					}))
			})));
	});

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

	/**
	 * Build a single PNG containing every currently occupied table, then use
	 * the device share sheet so WhatsApp can receive it as an image attachment.
	 */
	async function shareSeatingPlan() {
		if (sharingSeatingPlan) return;
		const tables = tableGroups
			.filter((table) => table.activePlayers.length > 0)
			.map((table) => ({
				number: table.number,
				name: tableNames[table.number] || `Table ${table.number}`,
				players: table.activePlayers
			}));
		if (!tables.length) {
			shareStatus = 'There are no seated players to share.';
			return;
		}
		sharingSeatingPlan = true;
		shareStatus = '';
		try {
			const width = 1200;
			const padding = 64;
			const gap = 28;
			const columns = tables.length > 1 ? 2 : 1;
			const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
			/** @type {number[]} */
			const rowHeights = [];
			for (let i = 0; i < tables.length; i += columns) {
				rowHeights.push(Math.max(...tables.slice(i, i + columns).map((table) => 104 + table.players.length * 54)));
			}
			const headerHeight = 210;
			const height = padding + headerHeight + rowHeights.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, rowHeights.length - 1) + padding;
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Unable to create the seating image.');
			context.fillStyle = '#111519';
			context.fillRect(0, 0, width, height);
			context.fillStyle = '#8fa99a';
			context.font = '700 22px system-ui, sans-serif';
			context.fillText('TOURNAMENT SEATING', padding, padding + 18);
			context.fillStyle = '#f1f4f1';
			context.font = '800 48px system-ui, sans-serif';
			context.fillText(String(venueName || 'Poker tournament').slice(0, 38), padding, padding + 82);
			context.fillStyle = '#aeb8b2';
			context.font = '500 25px system-ui, sans-serif';
			context.fillText(new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date()), padding, padding + 130);
			context.fillText(`${tables.reduce((sum, table) => sum + table.players.length, 0)} players · ${tables.length} tables`, padding, padding + 170);
			let y = padding + headerHeight;
			let tableIndex = 0;
			for (let row = 0; row < rowHeights.length; row += 1) {
				for (let column = 0; column < columns; column += 1) {
					const table = tables[tableIndex++];
					if (!table) continue;
					const x = padding + column * (cardWidth + gap);
					const cardHeight = rowHeights[row];
					context.fillStyle = '#20272c';
					context.beginPath();
					context.roundRect(x, y, cardWidth, cardHeight, 18);
					context.fill();
					context.fillStyle = '#8fa99a';
					context.fillRect(x, y, 8, cardHeight);
					context.fillStyle = '#f2f5f2';
					context.font = '800 29px system-ui, sans-serif';
					context.fillText(table.name.slice(0, 28), x + 28, y + 48, cardWidth - 56);
					context.fillStyle = '#9da9a2';
					context.font = '600 18px system-ui, sans-serif';
					context.fillText(`${table.players.length} PLAYERS`, x + 28, y + 79);
					let playerY = y + 125;
					for (const player of table.players) {
						context.fillStyle = '#a9b5ad';
						context.font = '700 19px system-ui, sans-serif';
						context.fillText(String(player.seat), x + 30, playerY);
						context.fillStyle = '#f0f2f0';
						context.font = '600 23px system-ui, sans-serif';
						context.fillText(String(player.name || 'Player').slice(0, 32), x + 78, playerY, cardWidth - 110);
						playerY += 54;
					}
				}
				y += rowHeights[row] + gap;
			}
			/** @type {Promise<Blob>} */
			const blobPromise = new Promise((resolve, reject) => {
				canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not export the seating image.')), 'image/png');
			});
			const blob = await blobPromise;
			const file = new File([blob], 'poker-seating-plan.png', { type: 'image/png' });
			if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
				await navigator.share({ files: [file] });
				shareStatus = 'Seating image shared.';
			} else {
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = url;
				link.download = 'poker-seating-plan.png';
				link.click();
				URL.revokeObjectURL(url);
				shareStatus = 'Image downloaded. Attach it to your WhatsApp group.';
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				shareStatus = 'Sharing cancelled.';
			} else {
				console.error('Seating plan sharing failed:', error);
				shareStatus = 'Unable to create or share the seating image.';
			}
		} finally {
			sharingSeatingPlan = false;
		}
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
			<div class="table-heading-actions">
				<button class="share-seating" type="button" onclick={shareSeatingPlan} disabled={sharingSeatingPlan || activePlayerCount === 0}>{sharingSeatingPlan ? 'Preparing image…' : 'Share seating plan'}</button>
				<button class="randomise-seating" type="button" onclick={randomiseSeats}>Randomise seating</button>
			</div>
			{#if shareStatus}<p class="seating-share-status" role="status">{shareStatus}</p>{/if}
		</div>

		<div class="table-list-view">
			{#each tableGroups as tableGroup (tableGroup.number)}
				{@const tableNumber = tableGroup.number}
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
						<span>{tableGroup.activeCount} / 8 players</span>
					</div>
					<div class="table-list-header">
						<span>Seat</span><span>Position</span><span>Player</span>
					</div>
					{#each tableGroup.seats as seatGroup (seatGroup.number)}
						{@const seatedPlayer = seatGroup.seatedPlayer}
						{@const eliminatedPlayer = seatGroup.eliminatedPlayer}
						<div class="table-list-row" class:eliminated-seat={!seatedPlayer && Boolean(eliminatedPlayer)}>
							<strong>{seatGroup.number}</strong>
							<span>{seatRole(seatGroup.number)}</span>
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
		<dialog open class="replace-modal" aria-labelledby="replace-modal-title">
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
		</dialog>
	</div>
{/if}
