const fs = require('fs');

const MAX_GAMES = 250;

// Trim batches array so the total number of games stored <= MAX_GAMES.
// Removes whole batches from the front (oldest), then proportionally
// trims the new oldest batch if the boundary falls mid-batch.
function trimBatches(batches) {
    let total = batches.reduce((sum, b) => sum + b.w + b.l, 0);
    while (total > MAX_GAMES && batches.length > 0) {
        const oldest = batches[0];
        const oldestTotal = oldest.w + oldest.l;
        const excess = total - MAX_GAMES;

        if (excess >= oldestTotal) {
            // Drop the entire oldest batch
            batches.shift();
            total -= oldestTotal;
        } else {
            // Proportionally trim the oldest batch
            const keepRatio = (oldestTotal - excess) / oldestTotal;
            oldest.w = Math.round(oldest.w * keepRatio);
            oldest.l = Math.round(oldest.l * keepRatio);
            total = batches.reduce((sum, b) => sum + b.w + b.l, 0);
            break;
        }
    }
    return batches;
}

// Migrate a role cache entry from old history[] format to new batches[] format.
function migrateRole(roleCache) {
    if (!roleCache.batches && roleCache.history !== undefined) {
        const w = roleCache.history.filter(x => x === 1).length;
        const l = roleCache.history.filter(x => x === 0).length;
        roleCache.batches = (w + l > 0) ? [{ w, l, ts: new Date().toISOString() }] : [];
        delete roleCache.history;
        console.log(`  migrated legacy history[] -> batches[] (${w}W / ${l}L)`);
    }
}

async function updateCache() {
    try {
        const listData = JSON.parse(fs.readFileSync('./preset_list.json', 'utf8'));
        let cache = { last_checked: null, players: {} };

        if (fs.existsSync('./presets.json')) {
            const fileContent = fs.readFileSync('./presets.json', 'utf8');
            if (fileContent) cache = JSON.parse(fileContent);
        }

        console.log(`Checking API for ${listData.players.length} players...`);

        const rolesMapping = { tank: 'tank', damage: 'dps', support: 'supp' };

        for (const player of listData.players) {
            const fullId = `${player.name}-${player.id}`;
            let playerChanged = false;

            try {
                const response = await fetch(`https://overfast-api.tekrop.fr/players/${fullId}/stats/summary?gamemode=competitive`);
                if (!response.ok) continue;
                const stats = await response.json();

                // First-seen: snapshot current totals as baseline, record nothing
                if (!cache.players[fullId]) {
                    const roles = {};
                    for (const [apiRole, cacheRole] of Object.entries(rolesMapping)) {
                        const roleData = stats.roles[apiRole] || { games_won: 0, games_lost: 0 };
                        roles[cacheRole] = {
                            batches: [],
                            last_total_w: roleData.games_won,
                            last_total_l: roleData.games_lost
                        };
                    }
                    cache.players[fullId] = {
                        label: player.name,
                        last_updated: new Date().toISOString(),
                        roles
                    };
                    console.log(`New: ${fullId} - baseline set, watching from now.`);
                    continue;
                }

                // Migrate any roles still using the old history[] format
                for (const cacheRole of Object.values(rolesMapping)) {
                    migrateRole(cache.players[fullId].roles[cacheRole]);
                }

                // Record new games since last check
                for (const [apiRole, cacheRole] of Object.entries(rolesMapping)) {
                    const roleData = stats.roles[apiRole] || { games_won: 0, games_lost: 0 };
                    const pCache = cache.players[fullId].roles[cacheRole];

                    const newWins   = roleData.games_won  - pCache.last_total_w;
                    const newLosses = roleData.games_lost - pCache.last_total_l;

                    if (newWins > 0 || newLosses > 0) {
                        playerChanged = true;

                        // Store as one atomic batch — we know W and L counts
                        // but not intra-batch ordering, so we never fabricate
                        // a sequence we don't have.
                        pCache.batches.push({
                            w:  newWins,
                            l:  newLosses,
                            ts: new Date().toISOString()
                        });

                        // Trim to MAX_GAMES total, dropping oldest batches first
                        pCache.batches = trimBatches(pCache.batches);

                        pCache.last_total_w = roleData.games_won;
                        pCache.last_total_l = roleData.games_lost;
                    }
                }

                if (playerChanged) {
                    cache.players[fullId].last_updated = new Date().toISOString();
                    console.log(`Updated: ${fullId}`);
                }

            } catch (error) {
                console.error(`Error fetching ${fullId}:`, error);
            }

            await new Promise(r => setTimeout(r, 1000));
        }

        cache.last_checked = new Date().toISOString();
        fs.writeFileSync('./presets.json', JSON.stringify(cache, null, 2));
        console.log('Cache Sync Complete.');

    } catch (err) {
        console.error("Critical error:", err);
    }
}

updateCache();