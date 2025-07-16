class MultiplayerBitcoinGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // WebSocket connection
        this.ws = null;
        this.playerId = null;
        this.gameId = null;
        
        // Game state
        this.gameActive = false;
        this.gameStartTime = 0;
        this.gameDuration = 120; // 2 minutes
        
        // Network monitoring
        this.networkStats = {
            bytesReceived: 0,
            messagesReceived: 0,
            lastStatsUpdate: Date.now(),
            lastMessageCount: 0
        };
        
        // Remove input throttling for smooth movement
        
        // World properties
        this.world = {
            width: 1600,
            height: 1200
        };
        
        // Camera system
        this.camera = { x: 0, y: 0 };
        
        // Player properties
        this.player = {
            x: 200, y: 200, size: 20, baseSpeed: 4.5, currentSpeed: 4.5,
            trail: [], color: '#f39c12', score: 0,
            baseX: 100, baseY: 100
        };
        
        // Opponent properties
        this.opponent = {
            x: 1400, y: 1000, size: 20, trail: [], color: '#e74c3c', score: 0,
            baseX: 1500, baseY: 1100
        };
        
        // Game objects
        this.bitcoins = [];
        this.obstacles = [];
        this.mouse = { x: this.width / 2, y: this.height / 2, isActive: false };
        this.keys = {};
        
        this.initUI();
        this.generateObstacles();
    }
    
    initUI() {
        // Splash screen handlers
        document.getElementById('joinLobbyBtn').addEventListener('click', () => {
            const playerName = document.getElementById('playerName').value.trim() || 'Anonymous';
            this.joinLobby(playerName);
        });
        
        document.getElementById('playAgainBtn').addEventListener('click', () => {
            location.reload();
        });
        
        // Enter key on name input
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('joinLobbyBtn').click();
            }
        });
    }
    
    joinLobby(playerName) {
        document.getElementById('splashScreen').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');
        
        // Connect to Socket.io
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.playerId = this.socket.id;
            this.socket.emit('joinLobby', {
                playerName: playerName
            });
        });
        
        this.socket.on('lobbyJoined', (data) => {
            document.getElementById('lobbyStatus').textContent = data.message;
        });
        
        this.socket.on('gameStart', (data) => {
            this.startGame(data);
        });
        
        this.socket.on('playerPosition', (data) => {
            // Network monitoring
            this.trackNetworkData(data);
            
            // Server sends back our authoritative position and trail
            this.player.x = data.x;
            this.player.y = data.y;
            if (data.trail) {
                this.player.trail = data.trail;
                this.lastTrailUpdate = Date.now();
            }
            console.log('Server updated our position to:', data.x, data.y, 'Trail length:', this.player.trail.length);
        });
        
        this.socket.on('trailUpdate', (data) => {
            // Server sends explicit trail updates (for bitcoin collection/stealing)
            console.log('Server sent trail update. New length:', data.trail.length);
            this.player.trail = data.trail;
        });
        
        this.socket.on('opponentMove', (data) => {
            this.trackNetworkData(data);
            this.updateOpponent(data);
        });
        
        this.socket.on('bitcoinCollected', (data) => {
            this.handleBitcoinCollected(data);
        });
        
        this.socket.on('scoreUpdate', (data) => {
            this.updateScores(data);
        });
        
        this.socket.on('gameEnd', (data) => {
            this.endGame(data);
        });
        
        this.socket.on('trailStolen', (data) => {
            this.handleTrailStolen(data);
        });
        
        this.socket.on('opponentDisconnected', () => {
            alert('Your opponent disconnected. You win by default!');
            location.reload();
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            alert('Connection lost. Please refresh the page.');
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Socket.io error:', error);
            alert('Connection error. Please refresh the page.');
        });
    }
    
    sendMessage(message) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(message.type, message);
        }
    }
    

    
    startGame(gameData) {
        console.log('Game starting!');
        
        // Hide lobby, show game
        document.getElementById('lobbyScreen').classList.add('hidden');
        document.getElementById('gameContainer').style.display = 'block';
        
        // Set up game state
        this.gameId = gameData.gameId;
        this.gameActive = true;
        this.gameStartTime = Date.now();
        this.gameDuration = gameData.duration;
        
        // Set player properties
        this.player.color = gameData.playerColor;
        this.player.baseX = gameData.playerBase.x;
        this.player.baseY = gameData.playerBase.y;
        this.player.x = gameData.playerBase.x + 100;
        this.player.y = gameData.playerBase.y + 100;
        
        // Set opponent properties
        this.opponent.color = gameData.opponentColor;
        this.opponent.baseX = gameData.opponentBase.x;
        this.opponent.baseY = gameData.opponentBase.y;
        this.opponent.x = gameData.opponentBase.x - 100;
        this.opponent.y = gameData.opponentBase.y - 100;
        
        // Set bitcoins
        this.bitcoins = gameData.bitcoins.map(b => ({
            ...b,
            size: 12,
            collected: false
        }));
        
        this.initGameControls();
        console.log('Starting game loop...');
        this.gameLoop();
        this.startTimer();
    }
    
    initGameControls() {
        console.log('Initializing game controls...');
        
        // Mouse controls
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
            this.mouse.isActive = true;
            // Debug: uncomment next line to see mouse movement
            // console.log('Mouse:', this.mouse.x, this.mouse.y);
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.isActive = false;
            console.log('Mouse left canvas');
        });
        
        this.canvas.addEventListener('mouseenter', () => {
            console.log('Mouse entered canvas');
        });
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            console.log('Key pressed:', e.key);
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
        
        // Add click handler to ensure canvas gets focus
        this.canvas.addEventListener('click', () => {
            this.canvas.focus();
            console.log('Canvas focused');
        });
        
        // Make canvas focusable
        this.canvas.setAttribute('tabindex', '0');
        this.canvas.style.outline = 'none';
    }
    
    startTimer() {
        const timerInterval = setInterval(() => {
            if (!this.gameActive) {
                clearInterval(timerInterval);
                return;
            }
            
            const elapsed = Date.now() - this.gameStartTime;
            const remaining = Math.max(0, this.gameDuration * 1000 - elapsed);
            
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            
            document.getElementById('timeLeft').textContent = 
                `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
            if (remaining <= 0) {
                this.gameActive = false;
                clearInterval(timerInterval);
            }
        }, 100);
    }
    
    update() {
        if (!this.gameActive) {
            console.log('Game not active, skipping update');
            return;
        }
        
        // Calculate dynamic speed
        const speedPenalty = this.player.trail.length * 0.15;
        this.player.currentSpeed = Math.max(1.5, this.player.baseSpeed - speedPenalty);
        
        const oldX = this.player.x;
        const oldY = this.player.y;
        
        // Only log occasionally to avoid spam
        if (Math.random() < 0.01) {
            console.log('Update - Player position before:', oldX, oldY, 'Game active:', this.gameActive);
        }
        
        // Check if any keys are pressed
        const keyPressed = this.keys['ArrowUp'] || this.keys['w'] || 
                          this.keys['ArrowDown'] || this.keys['s'] || 
                          this.keys['ArrowLeft'] || this.keys['a'] || 
                          this.keys['ArrowRight'] || this.keys['d'];
        
        // Send input to server instead of moving locally (no throttling for smooth movement)
        if (keyPressed) {
            console.log('Sending keyboard input to server');
            if (this.socket && this.socket.connected) {
                this.socket.emit('playerInput', {
                    type: 'keyboard',
                    keys: {
                        w: this.keys['w'] || this.keys['ArrowUp'],
                        s: this.keys['s'] || this.keys['ArrowDown'],
                        a: this.keys['a'] || this.keys['ArrowLeft'],
                        d: this.keys['d'] || this.keys['ArrowRight']
                    }
                });
            }
        } else if (this.mouse.isActive) {
            console.log('Sending mouse input to server');
            // Send mouse target to server
            const worldMouseX = this.mouse.x + this.camera.x;
            const worldMouseY = this.mouse.y + this.camera.y;
            
            if (this.socket && this.socket.connected) {
                this.socket.emit('playerInput', {
                    type: 'mouse',
                    targetX: worldMouseX,
                    targetY: worldMouseY
                });
            }
        }
        
        // Update camera
        this.updateCamera();
        
        // Check bitcoin collection
        this.checkBitcoinCollection();
        
        // Check base return
        this.checkBaseReturn();
        
        // Light client-side trail interpolation for smoothness when server updates are less frequent
        if (this.player.trail.length > 5 && this.lastTrailUpdate && Date.now() - this.lastTrailUpdate > 50) {
            this.updateTrail(); // Only do light interpolation for long trails
        }
        
        // Debug: Log trail info occasionally
        if (Math.random() < 0.01 && this.player.trail.length > 0) {
            console.log('Trail length:', this.player.trail.length, 'First segment:', this.player.trail[0]);
        }
        
        // Note: Server handles authoritative trail positioning, client only does light interpolation
        
        // Update UI
        document.getElementById('collected').textContent = this.player.trail.length;
    } 
   
    updateCamera() {
        this.camera.x = this.player.x - this.width / 2;
        this.camera.y = this.player.y - this.height / 2;
        
        this.camera.x = Math.max(0, Math.min(this.world.width - this.width, this.camera.x));
        this.camera.y = Math.max(0, Math.min(this.world.height - this.height, this.camera.y));
    }
    
    checkObstacleCollision(x, y) {
        for (let obstacle of this.obstacles) {
            if (x - this.player.size < obstacle.x + obstacle.width &&
                x + this.player.size > obstacle.x &&
                y - this.player.size < obstacle.y + obstacle.height &&
                y + this.player.size > obstacle.y) {
                return true;
            }
        }
        return false;
    }
    
    checkBitcoinCollection() {
        this.bitcoins.forEach(bitcoin => {
            if (!bitcoin.collected) {
                const dist = Math.sqrt(
                    Math.pow(this.player.x - bitcoin.x, 2) + 
                    Math.pow(this.player.y - bitcoin.y, 2)
                );
                
                if (dist < this.player.size + bitcoin.size) {
                    // Only notify server - don't modify trail locally
                    // Server will send back the authoritative trail update
                    if (this.socket && this.socket.connected) {
                        this.socket.emit('collectBitcoin', {
                            bitcoinId: bitcoin.id
                        });
                    }
                }
            }
        });
    }
    
    checkBaseReturn() {
        const dist = Math.sqrt(
            Math.pow(this.player.x - this.player.baseX, 2) + 
            Math.pow(this.player.y - this.player.baseY, 2)
        );
        
        if (dist < 50 && this.player.trail.length > 0) {
            const score = this.player.trail.length * 10;
            
            // Notify server - don't modify trail or score locally
            // Server will handle the authoritative update
            if (this.socket && this.socket.connected) {
                this.socket.emit('returnToBase', {
                    score: score
                });
            }
        }
    }
    
    updateTrail() {
        if (this.player.trail.length > 0) {
            let prevX = this.player.x;
            let prevY = this.player.y;
            
            this.player.trail.forEach((segment, index) => {
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
    
    updateOpponent(data) {
        this.opponent.x = data.x;
        this.opponent.y = data.y;
        
        // Only update trail if trail data is provided (performance optimization)
        if (data.trail !== undefined) {
            this.opponent.trail = data.trail;
        }
        
        // Check collision with opponent (trail stealing!)
        const dist = Math.sqrt(
            Math.pow(this.player.x - this.opponent.x, 2) + 
            Math.pow(this.player.y - this.opponent.y, 2)
        );
        
        if (dist < this.player.size + this.opponent.size) {
            if (this.player.trail.length > 0) {
                // Opponent steals our trail!
                this.player.trail = [];
                // Visual feedback could be added here
            }
        }
    }
    
    handleBitcoinCollected(data) {
        const bitcoin = this.bitcoins.find(b => b.id === data.bitcoinId);
        if (bitcoin) {
            bitcoin.collected = true;
        }
    }
    
    updateScores(data) {
        this.player.score = data.scores[this.playerId] || 0;
        this.opponent.score = Object.values(data.scores).find(score => score !== this.player.score) || 0;
        
        document.getElementById('playerScore').textContent = this.player.score;
        document.getElementById('opponentScore').textContent = this.opponent.score;
    }
    
    handleTrailStolen(data) {
        console.log('Trail stolen event:', data);
        
        if (data.thief === this.playerId) {
            // We stole bitcoins from opponent!
            console.log(`You stole ${data.stolenCount} bitcoins!`);
            // Visual feedback - maybe flash the screen or show a message
            this.showStealMessage(`+${data.stolenCount} bitcoins stolen!`, '#2ecc71');
        } else if (data.victim === this.playerId) {
            // Our bitcoins were stolen!
            console.log(`${data.stolenCount} bitcoins were stolen from you!`);
            // Visual feedback - maybe flash red or show warning
            this.showStealMessage(`-${data.stolenCount} bitcoins stolen!`, '#e74c3c');
        }
    }
    
    showStealMessage(message, color) {
        // Create a temporary message element
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.style.position = 'absolute';
        messageDiv.style.top = '50%';
        messageDiv.style.left = '50%';
        messageDiv.style.transform = 'translate(-50%, -50%)';
        messageDiv.style.color = color;
        messageDiv.style.fontSize = '24px';
        messageDiv.style.fontWeight = 'bold';
        messageDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
        messageDiv.style.zIndex = '1000';
        messageDiv.style.pointerEvents = 'none';
        
        document.getElementById('gameContainer').appendChild(messageDiv);
        
        // Animate and remove after 2 seconds
        setTimeout(() => {
            messageDiv.style.transition = 'opacity 0.5s';
            messageDiv.style.opacity = '0';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 500);
        }, 1500);
    }
    
    trackNetworkData(data) {
        // Estimate data size (rough calculation)
        const dataSize = JSON.stringify(data).length;
        this.networkStats.bytesReceived += dataSize;
        this.networkStats.messagesReceived++;
        
        // Update network stats display every second
        const now = Date.now();
        if (now - this.networkStats.lastStatsUpdate > 1000) {
            const timeDiff = (now - this.networkStats.lastStatsUpdate) / 1000;
            const bytesPerSecond = (this.networkStats.bytesReceived) / timeDiff;
            const messagesPerSecond = (this.networkStats.messagesReceived - this.networkStats.lastMessageCount) / timeDiff;
            
            document.getElementById('networkStats').textContent = `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
            document.getElementById('updateRate').textContent = `${messagesPerSecond.toFixed(1)}/s`;
            
            this.networkStats.lastStatsUpdate = now;
            this.networkStats.lastMessageCount = this.networkStats.messagesReceived;
            this.networkStats.bytesReceived = 0; // Reset for next measurement
        }
    }
    
    endGame(data) {
        this.gameActive = false;
        
        document.getElementById('finalPlayerScore').textContent = this.player.score;
        document.getElementById('finalOpponentScore').textContent = this.opponent.score;
        
        const resultText = document.getElementById('resultText');
        if (data.isWinner) {
            resultText.textContent = '🎉 You Win!';
            resultText.className = 'winner';
        } else if (data.winner === null) {
            resultText.textContent = '🤝 It\'s a Tie!';
            resultText.className = 'winner';
        } else {
            resultText.textContent = '😔 You Lose!';
            resultText.className = 'loser';
        }
        
        document.getElementById('gameEndScreen').style.display = 'block';
    }
    
    generateObstacles() {
        this.obstacles = [
            { x: 200, y: 200, width: 150, height: 20 },
            { x: 200, y: 200, width: 20, height: 150 },
            { x: 600, y: 400, width: 200, height: 20 },
            { x: 600, y: 500, width: 200, height: 20 },
            { x: 600, y: 400, width: 20, height: 120 },
            { x: 780, y: 400, width: 20, height: 120 },
            { x: 1000, y: 300, width: 20, height: 200 },
            { x: 400, y: 800, width: 300, height: 20 },
            { x: 1200, y: 600, width: 150, height: 20 },
            { x: 0, y: 0, width: this.world.width, height: 20 },
            { x: 0, y: this.world.height - 20, width: this.world.width, height: 20 },
            { x: 0, y: 0, width: 20, height: this.world.height },
            { x: this.world.width - 20, y: 0, width: 20, height: this.world.height }
        ];
    }
    
    draw() {
        if (!this.gameActive) return;
        
        // Clear canvas
        this.ctx.fillStyle = '#16213e';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw obstacles
        this.ctx.fillStyle = '#8e44ad';
        this.obstacles.forEach(obstacle => {
            const screenX = obstacle.x - this.camera.x;
            const screenY = obstacle.y - this.camera.y;
            
            if (screenX + obstacle.width > 0 && screenX < this.width &&
                screenY + obstacle.height > 0 && screenY < this.height) {
                this.ctx.fillRect(screenX, screenY, obstacle.width, obstacle.height);
            }
        });
        
        // Draw bases
        this.drawBase(this.player.baseX, this.player.baseY, this.player.color, 'YOUR BASE');
        this.drawBase(this.opponent.baseX, this.opponent.baseY, this.opponent.color, 'OPPONENT');
        
        // Draw bitcoins
        this.bitcoins.forEach(bitcoin => {
            if (!bitcoin.collected) {
                const screenX = bitcoin.x - this.camera.x;
                const screenY = bitcoin.y - this.camera.y;
                
                if (screenX > -20 && screenX < this.width + 20 &&
                    screenY > -20 && screenY < this.height + 20) {
                    this.ctx.fillStyle = '#f39c12';
                    this.ctx.font = '16px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('₿', screenX, screenY + 6);
                }
            }
        });
        
        // Draw opponent and trail
        this.drawPlayer(this.opponent, '🤖');
        
        // Draw player and trail
        this.drawPlayer(this.player, '👻');
        
        // Debug: Show player position
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Player: ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`, 10, this.height - 40);
        this.ctx.fillText(`Mouse: ${this.mouse.isActive ? 'Active' : 'Inactive'} (${this.mouse.x}, ${this.mouse.y})`, 10, this.height - 20);
    }
    
    drawBase(baseX, baseY, color, label) {
        const screenX = baseX - this.camera.x;
        const screenY = baseY - this.camera.y;
        
        if (screenX + 50 > 0 && screenX - 50 < this.width &&
            screenY + 50 > 0 && screenY - 50 < this.height) {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(screenX - 25, screenY - 25, 50, 50);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(label, screenX, screenY + 4);
        }
    }
    
    drawPlayer(player, emoji) {
        const screenX = player.x - this.camera.x;
        const screenY = player.y - this.camera.y;
        
        // Draw trail
        player.trail.forEach((segment, index) => {
            const segmentScreenX = segment.x - this.camera.x;
            const segmentScreenY = segment.y - this.camera.y;
            
            this.ctx.fillStyle = player.color;
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('₿', segmentScreenX, segmentScreenY + 5);
            
            // Draw connection line
            if (index === 0) {
                this.ctx.strokeStyle = player.color;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(screenX, screenY);
                this.ctx.lineTo(segmentScreenX, segmentScreenY);
                this.ctx.stroke();
            } else {
                const prevSegmentScreenX = player.trail[index-1].x - this.camera.x;
                const prevSegmentScreenY = player.trail[index-1].y - this.camera.y;
                
                this.ctx.strokeStyle = player.color;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(prevSegmentScreenX, prevSegmentScreenY);
                this.ctx.lineTo(segmentScreenX, segmentScreenY);
                this.ctx.stroke();
            }
        });
        
        // Draw player
        this.ctx.fillStyle = player.color;
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(emoji, screenX, screenY + 8);
        
        // Add bitcoin symbol
        this.ctx.fillStyle = player.color;
        this.ctx.font = '12px Arial';
        this.ctx.fillText('₿', screenX, screenY - 5);
    }
    
    gameLoop() {
        if (this.gameActive) {
            this.update();
            this.draw();
            requestAnimationFrame(() => this.gameLoop());
        } else {
            console.log('Game loop stopped - gameActive is false');
        }
    }
}

// Start the game when page loads
window.addEventListener('load', () => {
    new MultiplayerBitcoinGame();
});