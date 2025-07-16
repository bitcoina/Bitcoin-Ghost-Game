const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Game state
const gameState = {
    lobby: [], // Players waiting for a match
    activeGames: new Map(), // gameId -> game data
    players: new Map() // playerId -> player data
};

// Simple HTTP server to serve static files
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './multiplayer.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// WebSocket upgrade handling
server.on('upgrade', (request, socket, head) => {
    const key = request.headers['sec-websocket-key'];
    const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`
    ];

    socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

    const playerId = crypto.randomUUID();
    console.log('Player connected:', playerId);

    // Handle WebSocket messages
    socket.on('data', (buffer) => {
        try {
            const message = parseWebSocketFrame(buffer);
            if (message) {
                handleMessage(playerId, socket, JSON.parse(message));
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    socket.on('close', () => {
        handleDisconnect(playerId);
    });

    // Send welcome message
    sendMessage(socket, {
        type: 'connected',
        playerId: playerId
    });
});

function parseWebSocketFrame(buffer) {
    if (buffer.length < 2) return null;
    
    const firstByte = buffer[0];
    const secondByte = buffer[1];
    
    const opCode = firstByte & 0x0f;
    if (opCode !== 0x01) return null; // Only handle text frames
    
    const masked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;
    
    if (payloadLength === 126) {
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
    } else if (payloadLength === 127) {
        payloadLength = buffer.readBigUInt64BE(offset);
        offset += 8;
    }
    
    let payload = buffer.slice(offset, offset + Number(payloadLength));
    
    if (masked) {
        const maskKey = buffer.slice(offset, offset + 4);
        offset += 4;
        payload = buffer.slice(offset, offset + Number(payloadLength));
        
        for (let i = 0; i < payload.length; i++) {
            payload[i] ^= maskKey[i % 4];
        }
    }
    
    return payload.toString('utf8');
}

function sendMessage(socket, message) {
    const data = JSON.stringify(message);
    const buffer = Buffer.from(data, 'utf8');
    const frame = Buffer.allocUnsafe(2 + buffer.length);
    
    frame[0] = 0x81; // Text frame
    frame[1] = buffer.length;
    buffer.copy(frame, 2);
    
    socket.write(frame);
}

function handleMessage(playerId, socket, message) {
    console.log('Message from', playerId, ':', message.type);
    
    switch (message.type) {
        case 'joinLobby':
            joinLobby(playerId, socket, message.playerName);
            break;
        case 'playerMove':
            handlePlayerMove(playerId, message);
            break;
        case 'collectBitcoin':
            handleBitcoinCollection(playerId, message);
            break;
        case 'returnToBase':
            handleBaseReturn(playerId, message);
            break;
    }
}

function joinLobby(playerId, socket, playerName) {
    const player = {
        id: playerId,
        socket: socket,
        name: playerName || `Player ${playerId.slice(0, 6)}`,
        inLobby: true,
        gameId: null
    };
    
    gameState.players.set(playerId, player);
    gameState.lobby.push(playerId);
    
    console.log(`${player.name} joined lobby. Lobby size: ${gameState.lobby.length}`);
    
    // Send lobby status
    sendMessage(socket, {
        type: 'lobbyJoined',
        position: gameState.lobby.length,
        message: gameState.lobby.length === 1 ? 'Waiting for opponent...' : 'Found opponent! Starting game...'
    });
    
    // Check if we can start a match
    if (gameState.lobby.length >= 2) {
        startMatch();
    }
}

function startMatch() {
    const player1Id = gameState.lobby.shift();
    const player2Id = gameState.lobby.shift();
    
    const player1 = gameState.players.get(player1Id);
    const player2 = gameState.players.get(player2Id);
    
    if (!player1 || !player2) return;
    
    const gameId = crypto.randomUUID();
    
    // Create game instance
    const game = {
        id: gameId,
        players: [player1Id, player2Id],
        startTime: Date.now(),
        duration: 120000, // 2 minutes
        bitcoins: generateBitcoins(),
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
    player1.gameId = gameId;
    player2.gameId = gameId;
    player1.inLobby = false;
    player2.inLobby = false;
    
    // Send game start to both players
    const gameStartData = {
        type: 'gameStart',
        gameId: gameId,
        opponent: player2.name,
        playerColor: '#f39c12',
        opponentColor: '#e74c3c',
        playerBase: { x: 100, y: 100 },
        opponentBase: { x: 1500, y: 1100 },
        bitcoins: game.bitcoins,
        duration: 120
    };
    
    sendMessage(player1.socket, gameStartData);
    sendMessage(player2.socket, {
        ...gameStartData,
        opponent: player1.name,
        playerColor: '#e74c3c',
        opponentColor: '#f39c12',
        playerBase: { x: 1500, y: 1100 },
        opponentBase: { x: 100, y: 100 }
    });
    
    console.log(`Game started: ${player1.name} vs ${player2.name}`);
    
    // Start game timer
    setTimeout(() => {
        endGame(gameId);
    }, 120000);
}

function generateBitcoins() {
    const bitcoins = [];
    for (let i = 0; i < 30; i++) {
        bitcoins.push({
            id: i,
            x: Math.random() * 1400 + 100,
            y: Math.random() * 900 + 100,
            collected: false
        });
    }
    return bitcoins;
}

function handlePlayerMove(playerId, message) {
    const player = gameState.players.get(playerId);
    if (!player || !player.gameId) return;
    
    const game = gameState.activeGames.get(player.gameId);
    if (!game) return;
    
    // Update player position
    game.playerData[playerId].x = message.x;
    game.playerData[playerId].y = message.y;
    game.playerData[playerId].trail = message.trail;
    
    // Send to opponent
    const opponentId = game.players.find(id => id !== playerId);
    const opponent = gameState.players.get(opponentId);
    
    if (opponent) {
        sendMessage(opponent.socket, {
            type: 'opponentMove',
            x: message.x,
            y: message.y,
            trail: message.trail
        });
    }
}

function handleBitcoinCollection(playerId, message) {
    const player = gameState.players.get(playerId);
    if (!player || !player.gameId) return;
    
    const game = gameState.activeGames.get(player.gameId);
    if (!game) return;
    
    const bitcoin = game.bitcoins.find(b => b.id === message.bitcoinId);
    if (bitcoin && !bitcoin.collected) {
        bitcoin.collected = true;
        
        // Notify both players
        game.players.forEach(pId => {
            const p = gameState.players.get(pId);
            if (p) {
                sendMessage(p.socket, {
                    type: 'bitcoinCollected',
                    bitcoinId: message.bitcoinId,
                    playerId: playerId
                });
            }
        });
    }
}

function handleBaseReturn(playerId, message) {
    const player = gameState.players.get(playerId);
    if (!player || !player.gameId) return;
    
    const game = gameState.activeGames.get(player.gameId);
    if (!game) return;
    
    game.scores[playerId] += message.score;
    
    // Send score update to both players
    game.players.forEach(pId => {
        const p = gameState.players.get(pId);
        if (p) {
            sendMessage(p.socket, {
                type: 'scoreUpdate',
                scores: game.scores,
                playerId: playerId
            });
        }
    });
}

function endGame(gameId) {
    const game = gameState.activeGames.get(gameId);
    if (!game) return;
    
    const [player1Id, player2Id] = game.players;
    const score1 = game.scores[player1Id];
    const score2 = game.scores[player2Id];
    
    const winner = score1 > score2 ? player1Id : score2 > score1 ? player2Id : null;
    
    // Send game end to both players
    game.players.forEach(pId => {
        const player = gameState.players.get(pId);
        if (player) {
            sendMessage(player.socket, {
                type: 'gameEnd',
                winner: winner,
                scores: game.scores,
                isWinner: winner === pId
            });
        }
    });
    
    // Clean up
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
            const opponent = gameState.players.get(opponentId);
            
            if (opponent) {
                sendMessage(opponent.socket, {
                    type: 'opponentDisconnected'
                });
            }
            
            gameState.activeGames.delete(player.gameId);
        }
    }
    
    gameState.players.delete(playerId);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Multiplayer Bitcoin Ghost server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to play!`);
});