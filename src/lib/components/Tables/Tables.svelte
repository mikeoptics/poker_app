<script>
	import './tables.css';

	/**
	 * @typedef {{
	 * id: number;
	 * name: string;
	 * table: number;
	 * seat: number;
	 * eliminated?: boolean;
	 * eliminationPosition?: number | null;
	 * }} TablePlayer
	 */

	/**
	 * @typedef {{
	 * name: string;
	 * from: number;
	 * to: number;
	 * seat: number;
	 * }} BalanceMove
	 */

	/** @type {{
	 * activePlayerCount: number;
	 * eliminatedPlayers: TablePlayer[];
	 * balanceMessage: string;
	 * balanceSuggestions: BalanceMove[];
	 * activePlayers: TablePlayer[];
	 * tableCount: number;
	 * seatRole: (seat: number) => string;
	 * applyBalance: (suggestion: BalanceMove) => void;
	 * randomiseSeats: () => void;
	 * }} */
	let {
		activePlayerCount,
		eliminatedPlayers,
		balanceMessage,
		balanceSuggestions,
		activePlayers,
		tableCount,
		seatRole,
		applyBalance,
		randomiseSeats
	} = $props();
</script>

<section class="tables-page">
	<div class="tables-panel">
		<div class="panel-heading">
			<div>
				<h2>Tables</h2>
			</div>

			<span class="player-count">
				{activePlayerCount}
				players

				{#if eliminatedPlayers.length}
					·
					{eliminatedPlayers.length}
					eliminated
				{/if}
			</span>
			<button class="randomise-seating" type="button" onclick={randomiseSeats}>Randomise seating</button>
		</div>

		{#if balanceMessage}
			<div class="balance-alert">
				<strong>
					{balanceMessage}
				</strong>

				{#if balanceSuggestions.length}
					<div class="balance-list">
						{#each balanceSuggestions as move}
							<div>
								<span>
									{move.name}
								</span>

								<b>
									Table
									{move.from}
									→ Table
									{move.to}, Seat
									{move.seat}
								</b>
							</div>
						{/each}
					</div>

					<button class="apply-balance" onclick={() => applyBalance(balanceSuggestions[0])}>
						Apply balance
					</button>
				{/if}
			</div>
		{/if}

		<div class="table-list-view">
			{#each Array(tableCount) as _, ti}
				{@const tableNumber = ti + 1}
				{@const tablePlayers = activePlayers
					.filter((p) => p.table === tableNumber)
					.sort((a, b) => a.seat - b.seat)}

				<section class="table-list-card">
					<div class="table-list-heading">
						<strong>Table {tableNumber}</strong>
						<span>{tablePlayers.length} / 8 players</span>
					</div>

					<div class="table-list-header">
						<span>Seat</span>
						<span>Position</span>
						<span>Player</span>
					</div>

					{#each tablePlayers as player}
						<div class="table-list-row">
							<strong>{player.seat}</strong>
							<span>{seatRole(player.seat)}</span>
							<b>{player.name}</b>
						</div>
					{/each}
				</section>
			{/each}

			{#if eliminatedPlayers.length}
				<section class="eliminated-list">
					<div class="table-list-heading">
						<strong>Eliminated</strong>
						<span>{eliminatedPlayers.length}</span>
					</div>

					{#each [...eliminatedPlayers].sort((a, b) => (b.eliminationPosition ?? 0) - (a.eliminationPosition ?? 0)) as player}
						<div class="eliminated-list-row">
							<strong>
								{player.eliminationPosition}
								{player.eliminationPosition === 1
									? 'st'
									: player.eliminationPosition === 2
										? 'nd'
										: player.eliminationPosition === 3
											? 'rd'
											: 'th'}
							</strong>

							<span>{player.name}</span>
						</div>
					{/each}
				</section>
			{/if}
		</div>
	</div>
</section>
