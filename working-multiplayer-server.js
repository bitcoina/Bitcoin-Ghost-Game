const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple HTTP server
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './multiplayer.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Try to use Socket.io if available
let io;
try {
    const socketIo = require('socket.io');
    io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    console.log('Socket.io loaded successfully');
} catch (error) {
    console.log('Socket.io not available, using fallback');
    // We'll implement a simple polling system instead
    setupPollingSystem();
}

// Game state
const gameState = {
    lobby: [],
    activeGames: new Map(),
    players: new Map()
};

function setupSocketIo() {
    io.on('connection', (socket) => {
        console.log('Player connected:', socket.id);

        socket.on('joinLobby', (data) => {
            const player = {
                id: socket.id,
                socket: socket,
                name: data.playerName || `Player ${socket.id.slice(0, 6)}`,
                inLobby: true
            };

            gameState.players.set(socket.id, player);
            gameState.lobby.push(socket.id);

            console.log(`${player.name} joined lobby. Lobby size: ${gameState.lobby.length}`);

            socket.emit('lobbyJoined', {
                position: gameState.lobby.length,
                message: gameState.lobby.length === 1 ? 'Waiting for opponent...' : 'Found opponent! Starting game...'
            });

            if (gameState.lobby.length >= 2) {
                startMatch();
            }
        });

        socket.on('playerInput', (data) => {
            const player = gameState.players.get(socket.id);
            if (player && player.gameId) {
                const game = gameState.activeGames.get(player.gameId);
                if (game && game.playerData[socket.id]) {
                    const playerData = game.playerData[socket.id];
                    
                    // Server processes movement based on input
                    const speed = 4.5 - (playerData.trail.length * 0.15);
                    const currentSpeed = Math.max(1.5, speed);
                    
                    // Apply movement based on input type
                    if (data.type === 'keyboard') {
                        if (data.keys.w || data.keys.ArrowUp) playerData.y -= currentSpeed;
                        if (data.keys.s || data.keys.ArrowDown) playerData.y += currentSpeed;
                        if (data.keys.a || data.keys.ArrowLeft) playerData.x -= currentSpeed;
                        if (data.keys.d || data.keys.ArrowRight) playerData.x += currentSpeed;
                    } else if (data.type === 'mouse') {
                        const dx = data.targetX - playerData.x;
                        const dy = data.targetY - playerData.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance > 5) {
                            const moveX = (dx / distance) * currentSpeed;
                            const moveY = (dy / distance) * currentSpeed;
                            playerData.x += moveX;
                            playerData.y += moveY;
                        }
                    }
                    
                    // Keep in bounds
                    playerData.x = Math.max(20, Math.min(1580, playerData.x));
                    playerData.y = Math.max(20, Math.min(1180, playerData.y));
                    
                    // Check trail collision with opponent
                    const opponentId = game.players.find(id => id !== socket.id);
                    const opponentData = game.playerData[opponentId];
                    
                    if (opponentData) {
                        // Check if current player collides with opponent's trail
                        const stolenSegments = checkTrailCollision(playerData, opponentData);
                        if (stolenSegments.length > 0) {
                            // Transfer stolen segments to current player
                            playerData.trail = [...playerData.trail, ...stolenSegments];
                            
                            // Send updated trails to both players
                            socket.emit('trailUpdate', {
                                trail: playerData.trail
                            });
                            
                            const opponent = gameState.players.get(opponentId);
                            if (opponent) {
                                opponent.socket.emit('trailUpdate', {
                                    trail: opponentData.trail
                                });
                            }
                            
                            // Notify both players about the trail steal
                            io.to(player.gameId).emit('trailStolen', {
                                thief: socket.id,
                                victim: opponentId,
                                stolenCount: stolenSegments.length
                            });
                            
                            console.log(`Player ${socket.id} stole ${stolenSegments.length} bitcoins from ${opponentId}`);
                        }
                    }
                    
                    // Always send position updates immediately for smooth movement
                    socket.emit('playerPosition', {
                        x: playerData.x,
                        y: playerData.y
                    });
                    
                    socket.to(player.gameId).emit('opponentMove', {
                        x: playerData.x,
                        y: playerData.y
                    });
                    
                    // Only update trail positions occasionally to reduce CPU load
                    const shouldUpdateTrail = !playerData.lastTrailUpdate || 
                                            Date.now() - playerData.lastTrailUpdate > 50; // Only 20 times per second
                    
                    if (shouldUpdateTrail && playerData.trail.length > 0) {
                        playerData.lastTrailUpdate = Date.now();
                        
                        // Update trail positions (expensive operation)
                        updateTrailPositions(playerData);
                        
                        // Send trail updates
                        socket.emit('playerPosition', {
                            x: playerData.x,
                            y: playerData.y,
                            trail: playerData.trail
                        });
                        
                        socket.to(player.gameId).emit('opponentMove', {
                            x: playerData.x,
                            y: playerData.y,
                            trail: playerData.trail
                        });
                    }
                }
            }
        });

        socket.on('collectBitcoin', (data) => {
            const player = gameState.players.get(socket.id);
            if (player && player.gameId) {
                const game = gameState.activeGames.get(player.gameId);
                if (game) {
                    const bitcoin = game.bitcoins.find(b => b.id === data.bitcoinId);
                    if (bitcoin && !bitcoin.collected) {
                        bitcoin.collected = true;
                        
                        // Add bitcoin to player's trail on server
                        const playerData = game.playerData[socket.id];
                        if (playerData) {
                            playerData.trail.push({
                                x: bitcoin.x,
                                y: bitcoin.y,
                                id: bitcoin.id,
                                stealCooldown: Date.now() + 500 // 500ms cooldown before this segment can be stolen
                            });
                            
                            console.log(`Player ${socket.id} collected bitcoin ${bitcoin.id}. Trail length: ${playerData.trail.length}`);
                            
                            // Send trail update to the player who collected
                            socket.emit('trailUpdate', {
                                trail: playerData.trail
                            });
                        }
                        
                        io.to(player.gameId).emit('bitcoinCollected', {
                            bitcoinId: data.bitcoinId,
                            playerId: socket.id
                        });
                    }
                }
            }
        });

        socket.on('returnToBase', (data) => {
            const player = gameState.players.get(socket.id);
            if (player && player.gameId) {
                const game = gameState.activeGames.get(player.gameId);
                if (game) {
                    const playerData = game.playerData[socket.id];
                    if (playerData && playerData.trail.length > 0) {
                        // Add score
                        game.scores[socket.id] = (game.scores[socket.id] || 0) + data.score;
                        
                        // Clear player's trail
                        playerData.trail = [];
                        
                        // Send trail update to clear the trail
                        socket.emit('trailUpdate', {
                            trail: []
                        });
                        
                        // Send score update
                        io.to(player.gameId).emit('scoreUpdate', {
                            scores: game.scores,
                            playerId: socket.id
                        });
                        
                        console.log(`Player ${socket.id} scored ${data.score} points. Total: ${game.scores[socket.id]}`);
                    }
                }
            }
        });

        socket.on('disconnect', () => {
            handleDisconnect(socket.id);
        });
    });

    function startMatch() {
        const player1Id = gameState.lobby.shift();
        const player2Id = gameState.lobby.shift();

        const player1 = gameState.players.get(player1Id);
        const player2 = gameState.players.get(player2Id);

        if (!player1 || !player2) return;

        const gameId = `game_${Date.now()}`;

        // Join both players to a room
        player1.socket.join(gameId);
        player2.socket.join(gameId);
        player1.gameId = gameId;
        player2.gameId = gameId;

        const game = {
            id: gameId,
            players: [player1Id, player2Id],
            startTime: Date.now(),
            scores: { [player1Id]: 0, [player2Id]: 0 },
            playerData: {
                [player1Id]: {
                    x: 200, y: 200, trail: [], color: '#f39c12', team: 0,
                    baseX: 100, baseY: 100
                },
                [player2Id]: {
                    x: 1400, y: 1000, trail: [], color: '#e74c3c', team: 1,
                    baseX: 1500, baseY: 1100
                }
            }
        };

        gameState.activeGames.set(gameId, game);

        // Generate bitcoins
        const bitcoins = [];
        for (let i = 0; i < 30; i++) {
            bitcoins.push({
                id: i,
                x: Math.random() * 1400 + 100,
                y: Math.random() * 900 + 100,
                collected: false
            });
        }
        
        // Add bitcoins to game state
        game.bitcoins = bitcoins;

        // Send game start to both players
        player1.socket.emit('gameStart', {
            gameId: gameId,
            opponent: player2.name,
            playerColor: '#f39c12',
            opponentColor: '#e74c3c',
            playerBase: { x: 100, y: 100 },
            opponentBase: { x: 1500, y: 1100 },
            bitcoins: bitcoins,
            duration: 120
        });

        player2.socket.emit('gameStart', {
            gameId: gameId,
            opponent: player1.name,
            playerColor: '#e74c3c',
            opponentColor: '#f39c12',
            playerBase: { x: 1500, y: 1100 },
            opponentBase: { x: 100, y: 100 },
            bitcoins: bitcoins,
            duration: 120
        });

        console.log(`Game started: ${player1.name} vs ${player2.name}`);

        // End game after 2 minutes
        setTimeout(() => {
            endGame(gameId);
        }, 120000);
    }

    function endGame(gameId) {
        const game = gameState.activeGames.get(gameId);
        if (!game) return;

        const [player1Id, player2Id] = game.players;
        const score1 = game.scores[player1Id] || 0;
        const score2 = game.scores[player2Id] || 0;

        const winner = score1 > score2 ? player1Id : score2 > score1 ? player2Id : null;

        io.to(gameId).emit('gameEnd', {
            winner: winner,
            scores: game.scores
        });

        // Send individual results
        const player1 = gameState.players.get(player1Id);
        const player2 = gameState.players.get(player2Id);

        if (player1) {
            player1.socket.emit('gameEnd', {
                winner: winner,
                scores: game.scores,
                isWinner: winner === player1Id
            });
        }

        if (player2) {
            player2.socket.emit('gameEnd', {
                winner: winner,
                scores: game.scores,
                isWinner: winner === player2Id
            });
        }

        gameState.activeGames.delete(gameId);
        console.log(`Game ended: ${gameId}`);
    }

    function handleDisconnect(playerId) {
        console.log('Player disconnected:', playerId);

        const player = gameState.players.get(playerId);
        if (!player) return;

        // Remove from lobby
        const lobbyIndex = gameState.lobby.indexOf(playerId);
        if (lobbyIndex > -1) {
            gameState.lobby.splice(lobbyIndex, 1);
        }

        // Handle active game
        if (player.gameId) {
            const game = gameState.activeGames.get(player.gameId);
            if (game) {
                // Notify opponent
                const opponentId = game.players.find(id => id !== playerId);
                if (opponentId) {
                    const opponent = gameState.players.get(opponentId);
                    if (opponent) {
                        opponent.socket.emit('opponentDisconnected');
                    }
                }
                gameState.activeGames.delete(player.gameId);
            }
        }

        gameState.players.delete(playerId);
    }
}

// Server-side trail position update function
function updateTrailPositions(playerData) {
    if (playerData.trail.length > 0) {
        let prevX = playerData.x;
        let prevY = playerData.y;
        
        playerData.trail.forEach((segment, index) => {
            // Calculate desired distance from previous segment
            const desiredDistance = 25; // Minimum distance between trail segments
            
            const dx = prevX - segment.x;
            const dy = prevY - segment.y;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            
            if (currentDistance > desiredDistance) {
                // Move towards previous segment but maintain minimum distance
                const moveRatio = (currentDistance - desiredDistance) / currentDistance;
                segment.x += dx * moveRatio * 0.15;
                segment.y += dy * moveRatio * 0.15;
            } else if (currentDistance < desiredDistance * 0.8) {
                // Push away if too close
                const pushRatio = (desiredDistance * 0.8 - currentDistance) / currentDistance;
                segment.x -= dx * pushRatio * 0.1;
                segment.y -= dy * pushRatio * 0.1;
            }
            
            prevX = segment.x;
            prevY = segment.y;
        });
    }
}

// Trail collision detection function with cooldown
function checkTrailCollision(player, opponent) {
    const stolenSegments = [];
    const playerRadius = 20; // Player collision radius
    const trailRadius = 12;  // Trail segment collision radius
    const currentTime = Date.now();
    
    // Check if player collides with any opponent trail segments
    for (let i = 0; i < opponent.trail.length; i++) {
        const segment = opponent.trail[i];
        
        // Check if segment is still in cooldown period
        if (segment.stealCooldown && currentTime < segment.stealCooldown) {
            continue; // Skip this segment, it's protected
        }
        
        const dx = player.x - segment.x;
        const dy = player.y - segment.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < playerRadius + trailRadius) {
            // Collision detected! Steal this segment and all segments behind it
            const segmentsToSteal = opponent.trail.splice(i); // Remove from opponent
            
            // Add cooldown to stolen segments to prevent immediate re-stealing
            segmentsToSteal.forEach(seg => {
                seg.stealCooldown = currentTime + 500; // 500ms cooldown
            });
            
            stolenSegments.push(...segmentsToSteal);
            console.log(`Trail collision detected! Stealing ${segmentsToSteal.length} segments`);
            break; // Only steal once per collision
        }
    }
    
    return stolenSegments;
}

// Fallback polling system if Socket.io isn't available
function setupPollingSystem() {
    console.log('Setting up polling fallback system');
    // This would be a more complex implementation
    // For now, we'll just log that Socket.io is needed
}

// Initialize the appropriate system
if (io) {
    setupSocketIo();
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Multiplayer server running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
    
    // Get local IP address
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';
    
    for (const interfaceName in networkInterfaces) {
        const networkInterface = networkInterfaces[interfaceName];
        for (const connection of networkInterface) {
            if (connection.family === 'IPv4' && !connection.internal) {
                localIP = connection.address;
                break;
            }
        }
        if (localIP !== 'localhost') break;
    }
    
    console.log(`Network access: http://${localIP}:${PORT}`);
    console.log(`Share this URL with other players on your network!`);
    
    if (!io) {
        console.log('WARNING: Socket.io not available. Please install it with: npm install socket.io express');
    }
});