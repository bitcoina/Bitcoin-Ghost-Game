const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(__dirname));

// Game state
const gameState = {
    players: {},
    bitcoins: [],
    world: {
        width: 1600,
        height: 1200
    },
    obstacles: []
};

// Initialize game world
function initializeGame() {
    // Generate bitcoins
    for (let i = 0; i < 40; i++) {
        gameState.bitcoins.push({
            id: i,
            x: Math.random() * (gameState.world.width - 40) + 20,
            y: Math.random() * (gameState.world.height - 40) + 20,
            size: 12,
            collected: false,
            collectedBy: null
        });
    }
    
    // Generate obstacles (same as client)
    const obstacles = [
        { x: 200, y: 200, width: 150, height: 20 },
        { x: 200, y: 200, width: 20, height: 150 },
        { x: 600, y: 400, width: 200, height: 20 },
        { x: 600, y: 500, width: 200, height: 20 },
        { x: 600, y: 400, width: 20, height: 120 },
        { x: 780, y: 400, width: 20, height: 120 },
        { x: 1000, y: 300, width: 20, height: 200 },
        { x: 400, y: 800, width: 300, height: 20 },
        { x: 1200, y: 600, width: 150, height: 20 },
        { x: 0, y: 0, width: gameState.world.width, height: 20 },
        { x: 0, y: gameState.world.height - 20, width: gameState.world.width, height: 20 },
        { x: 0, y: 0, width: 20, height: gameState.world.height },
        { x: gameState.world.width - 20, y: 0, width: 20, height: gameState.world.height }
    ];
    
    gameState.obstacles = obstacles;
}

// Player colors for teams
const playerColors = ['#f39c12', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f1c40f'];
let colorIndex = 0;

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Create new player
    const player = {
        id: socket.id,
        x: gameState.world.width / 2 + (Math.random() - 0.5) * 200,
        y: gameState.world.height / 2 + (Math.random() - 0.5) * 200,
        size: 20,
        baseSpeed: 4.5,
        currentSpeed: 4.5,
        trail: [],
        color: playerColors[colorIndex % playerColors.length],
        score: 0,
        team: colorIndex % 2 // 0 or 1 for two teams
    };
    
    colorIndex++;
    gameState.players[socket.id] = player;
    
    // Send initial game state to new player
    socket.emit('gameState', {
        players: gameState.players,
        bitcoins: gameState.bitcoins,
        obstacles: gameState.obstacles,
        world: gameState.world,
        playerId: socket.id
    });
    
    // Notify other players
    socket.broadcast.emit('playerJoined', player);
    
    // Handle player movement
    socket.on('playerMove', (data) => {
        if (gameState.players[socket.id]) {
            const player = gameState.players[socket.id];
            
            // Basic validation and collision detection would go here
            player.x = Math.max(player.size, Math.min(gameState.world.width - player.size, data.x));
            player.y = Math.max(player.size, Math.min(gameState.world.height - player.size, data.y));
            player.trail = data.trail || [];
            
            // Broadcast to other players
            socket.broadcast.emit('playerUpdate', {
                id: socket.id,
                x: player.x,
                y: player.y,
                trail: player.trail
            });
        }
    });
    
    // Handle bitcoin collection
    socket.on('collectBitcoin', (bitcoinId) => {
        const bitcoin = gameState.bitcoins.find(b => b.id === bitcoinId);
        if (bitcoin && !bitcoin.collected) {
            bitcoin.collected = true;
            bitcoin.collectedBy = socket.id;
            
            // Broadcast to all players
            io.emit('bitcoinCollected', {
                bitcoinId: bitcoinId,
                playerId: socket.id
            });
        }
    });
    
    // Handle base return (scoring)
    socket.on('returnToBase', (data) => {
        const player = gameState.players[socket.id];
        if (player && data.bitcoinCount > 0) {
            player.score += data.bitcoinCount * 10;
            
            // Respawn some bitcoins
            for (let i = 0; i < Math.min(data.bitcoinCount, 5); i++) {
                const newBitcoin = {
                    id: Date.now() + Math.random(),
                    x: Math.random() * (gameState.world.width - 40) + 20,
                    y: Math.random() * (gameState.world.height - 40) + 20,
                    size: 12,
                    collected: false,
                    collectedBy: null
                };
                gameState.bitcoins.push(newBitcoin);
            }
            
            // Broadcast score update and new bitcoins
            io.emit('scoreUpdate', {
                playerId: socket.id,
                score: player.score,
                newBitcoins: gameState.bitcoins.slice(-Math.min(data.bitcoinCount, 5))
            });
        }
    });
    
    // Handle player disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        // Return collected bitcoins to the world
        gameState.bitcoins.forEach(bitcoin => {
            if (bitcoin.collectedBy === socket.id) {
                bitcoin.collected = false;
                bitcoin.collectedBy = null;
            }
        });
        
        delete gameState.players[socket.id];
        socket.broadcast.emit('playerLeft', socket.id);
    });
});

// Initialize game
initializeGame();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Bitcoin Ghost Game server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to play!`);
});