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
	 * tableView: string;
	 * activePlayerCount: number;
	 * eliminatedPlayers: TablePlayer[];
	 * balanceMessage: string;
	 * balanceSuggestions: BalanceMove[];
	 * activePlayers: TablePlayer[];
	 * tableCount: number;
	 * isFinalTable: boolean;
	 * finalSeats: number[];
	 * seats: number[];
	 * seatRole: (seat: number) => string;
	 * removePlayer: (id: number) => void;
	 * applyBalance: (suggestion: BalanceMove) => void;
	 * }} */
	let {
		tableView = $bindable(),
		activePlayerCount,
		eliminatedPlayers,
		balanceMessage,
		balanceSuggestions,
		activePlayers,
		tableCount,
		isFinalTable,
		finalSeats,
		seats,
		seatRole,
		removePlayer,
		applyBalance
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
		</div>

		<div class="table-view-toggle">
			<button class:active={tableView === 'visual'} onclick={() => (tableView = 'visual')}>
				Visual
			</button>

			<button class:active={tableView === 'list'} onclick={() => (tableView = 'list')}>
				List
			</button>
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

		{#if tableView === 'visual'}
			<div class="tables">
				{#each Array(tableCount) as _, ti}
					{@const tableNumber = ti + 1}
					{@const tablePlayers = activePlayers.filter((p) => p.table === tableNumber)}

					<article class="poker-table-card">
						<div class="table-title">
							<div>
								<span class="label">
									TABLE
									{tableNumber}
								</span>

								<strong>
									{tablePlayers.length} / 8
								</strong>
							</div>
						</div>

						<div
							class:final-layout={isFinalTable}
							class="table-layout"
							style="background-image:url('/poker-table.svg')"
						>
							{#each isFinalTable ? finalSeats : seats as seat}
								{@const p = activePlayers.find((x) => x.table === tableNumber && x.seat === seat)}

								<div class={`seat seat-${seat}`}>
									{#if p}
										<button
											class="seat-box occupied seat-eliminate-box"
											onclick={() => removePlayer(p.id)}
										>
											<div
												class="seat-number"
												class:small-blind={seat === 2}
												class:big-blind={seat === 3}
											>
												{seatRole(seat)}
											</div>

											<strong class="seat-name">
												{p.name}
											</strong>

											<span class="seat-eliminate-label"> ELIMINATE? </span>
										</button>
									{:else}
										<div class="seat-box">
											<div
												class="seat-number"
												class:small-blind={seat === 2}
												class:big-blind={seat === 3}
											>
												{seatRole(seat)}
											</div>

											<span class="empty-seat">EMPTY</span>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</article>
				{/each}
			</div>
		{:else}
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

								<button class="eliminate-button" onclick={() => removePlayer(player.id)}>
									Eliminate
								</button>
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

						{#each [...eliminatedPlayers].sort((a, b) => (a.eliminationPosition ?? 999) - (b.eliminationPosition ?? 999)) as player}
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
		{/if}
	</div>
</section>
