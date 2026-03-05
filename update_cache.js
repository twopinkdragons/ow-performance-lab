const fs = require('fs');

async function updateCache() {
    const data = JSON.parse(fs.readFileSync('./presets.json', 'utf8'));
    const playerIds = Object.keys(data.players);
    
    console.log(`Starting update for ${playerIds.length} players...`);

    for (const id of playerIds) {
        try {
            const response = await fetch(`https://overfast-api.tekrop.fr/players/${id}/stats/summary?gamemode=competitive`);
            if (response.ok) {
                const stats = await response.json();
                data.players[id] = stats;
                console.log(`Successfully updated: ${id}`);
            }
        } catch (error) {
            console.error(`Failed to update ${id}:`, error);
        }
        // Small delay to be polite to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    data.last_updated = new Date().toISOString();
    fs.writeFileSync('./presets.json', JSON.stringify(data, null, 2));
    console.log('Cache update complete.');
}

updateCache();
