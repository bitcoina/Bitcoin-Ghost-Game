class BitcoinGhostGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // World properties (larger than canvas)
        this.world = {
            width: 1600,  // 2x canvas width
            height: 1200  // 2x canvas height
        };
        
        // Camera system
        this.camera = {
            x: 0,
            y: 0
        };
        
        // Player properties (world coordinates)
        this.player = {
            x: this.world.width / 2,
            y: this.world.height / 2,
            size: 20,
            baseSpeed: 4.5,
            currentSpeed: 4.5,
            trail: [],
            color: '#f39c12'
        };
        
        // Mouse controls (screen coordinates)
        this.mouse = {
            x: this.width / 2,
            y: this.height / 2,
            isActive: false
        };
        
        // Game state
        this.score = 0;
        this.bitcoins = [];
        this.obstacles = [];
        this.keys = {};
        this.bots = []; // AI players for demo
        
        // Base location (world coordinates)
        this.base = {
            x: 100,
            y: 100,
            size: 50,
            color: '#27ae60'
        };
        
        this.init();
    }
    
    init() {
        // Generate content for larger world
        this.generateBitcoins();
        this.generateObstacles();
        this.generateBots();
        
        // Event listeners
        document.addEventListener('keydown', (e) => this.keys[e.key] = true);
        document.addEventListener('keyup', (e) => this.keys[e.key] = false);
        
        // Mouse controls
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
            this.mouse.isActive = true;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.isActive = false;
        });
        
        // Start game loop
        this.gameLoop();
    }
    
    generateBitcoins() {
        // Create random bitcoin symbols around the larger world
        for (let i = 0; i < 40; i++) {
            this.bitcoins.push({
                x: Math.random() * (this.world.width - 40) + 20,
                y: Math.random() * (this.world.height - 40) + 20,
                size: 12,
                collected: false
            });
        }
    }
    
    generateObstacles() {
        // Create wall-like obstacles throughout the world
        const obstacles = [
            // Corner walls
            { x: 200, y: 200, width: 150, height: 20 },
            { x: 200, y: 200, width: 20, height: 150 },
            
            // Center maze-like structures
            { x: 600, y: 400, width: 200, height: 20 },
            { x: 600, y: 500, width: 200, height: 20 },
            { x: 600, y: 400, width: 20, height: 120 },
            { x: 780, y: 400, width: 20, height: 120 },
            
            // More scattered walls
            { x: 1000, y: 300, width: 20, height: 200 },
            { x: 400, y: 800, width: 300, height: 20 },
            { x: 1200, y: 600, width: 150, height: 20 },
            
            // Border walls (not complete borders, just some walls)
            { x: 0, y: 0, width: this.world.width, height: 20 }, // Top
            { x: 0, y: this.world.height - 20, width: this.world.width, height: 20 }, // Bottom
            { x: 0, y: 0, width: 20, height: this.world.height }, // Left
            { x: this.world.width - 20, y: 0, width: 20, height: this.world.height } // Right
        ];
        
        this.obstacles = obstacles;
    }
    
    generateBots() {
        // Create AI bots to simulate multiplayer
        const botColors = ['#e74c3c', '#3498db', '#2ecc71'];
        const botEmojis = ['🤖', '👾', '🎮'];
        
        for (let i = 0; i < 3; i++) {
            this.bots.push({
                x: Math.random() * (this.world.width - 200) + 100,
                y: Math.random() * (this.world.height - 200) + 100,
                size: 20,
                baseSpeed: 3 + Math.random() * 2,
                currentSpeed: 3,
                trail: [],
                color: botColors[i],
                emoji: botEmojis[i],
                targetX: 0,
                targetY: 0,
                state: 'collecting', // 'collecting' or 'returning'
                lastDirectionChange: 0
            });
        }
    }
    
    update() {
        // Calculate dynamic speed based on trail length (slower with more bitcoins)
        const speedPenalty = this.player.trail.length * 0.15;
        this.player.currentSpeed = Math.max(1.5, this.player.baseSpeed - speedPenalty);
        
        // Store old position for collision detection
        const oldX = this.player.x;
        const oldY = this.player.y;
        
        // Mouse movement (primary control method) - convert screen to world coordinates
        if (this.mouse.isActive) {
            const worldMouseX = this.mouse.x + this.camera.x;
            const worldMouseY = this.mouse.y + this.camera.y;
            
            const dx = worldMouseX - this.player.x;
            const dy = worldMouseY - this.player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 5) { // Only move if mouse is far enough away
                const moveX = (dx / distance) * this.player.currentSpeed;
                const moveY = (dy / distance) * this.player.currentSpeed;
                
                this.player.x += moveX;
                this.player.y += moveY;
            }
        } else {
            // Keyboard fallback controls
            if (this.keys['ArrowUp'] || this.keys['w']) this.player.y -= this.player.currentSpeed;
            if (this.keys['ArrowDown'] || this.keys['s']) this.player.y += this.player.currentSpeed;
            if (this.keys['ArrowLeft'] || this.keys['a']) this.player.x -= this.player.currentSpeed;
            if (this.keys['ArrowRight'] || this.keys['d']) this.player.x += this.player.currentSpeed;
        }
        
        // Check collision with obstacles
        if (this.checkObstacleCollision(this.player.x, this.player.y)) {
            // Revert to old position if collision detected
            this.player.x = oldX;
            this.player.y = oldY;
        }
        
        // Keep player in world bounds
        this.player.x = Math.max(this.player.size, Math.min(this.world.width - this.player.size, this.player.x));
        this.player.y = Math.max(this.player.size, Math.min(this.world.height - this.player.size, this.player.y));
        
        // Update camera to follow player
        this.updateCamera();
        
        // Check bitcoin collection
        this.checkBitcoinCollection();
        
        // Check base return
        this.checkBaseReturn();
        
        // Update trail
        this.updateTrail();
        
        // Update bots
        this.updateBots();
        
        // Update UI
        document.getElementById('collected').textContent = this.player.trail.length;
        document.getElementById('score').textContent = this.score;
    }
    
    updateCamera() {
        // Center camera on player
        this.camera.x = this.player.x - this.width / 2;
        this.camera.y = this.player.y - this.height / 2;
        
        // Keep camera within world bounds
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
                    bitcoin.collected = true;
                    this.player.trail.push({
                        x: bitcoin.x,
                        y: bitcoin.y,
                        targetX: this.player.x,
                        targetY: this.player.y
                    });
                }
            }
        });
    }
    
    checkBaseReturn() {
        const dist = Math.sqrt(
            Math.pow(this.player.x - this.base.x, 2) + 
            Math.pow(this.player.y - this.base.y, 2)
        );
        
        if (dist < this.player.size + this.base.size && this.player.trail.length > 0) {
            // Score points and clear trail
            this.score += this.player.trail.length * 10;
            this.player.trail = [];
            
            // Respawn some bitcoins
            this.respawnBitcoins();
        }
    }
    
    updateTrail() {
        // Make trail follow player with smooth movement
        if (this.player.trail.length > 0) {
            let prevX = this.player.x;
            let prevY = this.player.y;
            
            this.player.trail.forEach((segment, index) => {
                const targetX = prevX;
                const targetY = prevY;
                
                // Smooth following movement
                segment.x += (targetX - segment.x) * 0.1;
                segment.y += (targetY - segment.y) * 0.1;
                
                prevX = segment.x;
                prevY = segment.y;
            });
        }
    }
    
    respawnBitcoins() {
        // Add new bitcoins to replace collected ones
        const collected = this.bitcoins.filter(b => b.collected).length;
        for (let i = 0; i < Math.min(collected, 5); i++) {
            this.bitcoins.push({
                x: Math.random() * (this.world.width - 40) + 20,
                y: Math.random() * (this.world.height - 40) + 20,
                size: 12,
                collected: false
            });
        }
    }
    
    updateBots() {
        this.bots.forEach(bot => {
            // Calculate speed penalty for trail length
            const speedPenalty = bot.trail.length * 0.15;
            bot.currentSpeed = Math.max(1.5, bot.baseSpeed - speedPenalty);
            
            // AI decision making
            if (bot.state === 'collecting') {
                // Look for nearby bitcoins or switch to returning if trail is long
                if (bot.trail.length > 5 || Math.random() < 0.01) {
                    bot.state = 'returning';
                    bot.targetX = this.base.x;
                    bot.targetY = this.base.y;
                } else {
                    // Find nearest bitcoin
                    let nearestBitcoin = null;
                    let nearestDist = Infinity;
                    
                    this.bitcoins.forEach(bitcoin => {
                        if (!bitcoin.collected) {
                            const dist = Math.sqrt(
                                Math.pow(bot.x - bitcoin.x, 2) + 
                                Math.pow(bot.y - bitcoin.y, 2)
                            );
                            if (dist < nearestDist) {
                                nearestDist = dist;
                                nearestBitcoin = bitcoin;
                            }
                        }
                    });
                    
                    if (nearestBitcoin) {
                        bot.targetX = nearestBitcoin.x;
                        bot.targetY = nearestBitcoin.y;
                    }
                }
            } else if (bot.state === 'returning') {
                // Head to base
                bot.targetX = this.base.x;
                bot.targetY = this.base.y;
                
                // Check if reached base
                const baseDist = Math.sqrt(
                    Math.pow(bot.x - this.base.x, 2) + 
                    Math.pow(bot.y - this.base.y, 2)
                );
                
                if (baseDist < this.base.size && bot.trail.length > 0) {
                    bot.trail = []; // Clear trail (scored)
                    bot.state = 'collecting';
                }
            }
            
            // Move towards target
            const dx = bot.targetX - bot.x;
            const dy = bot.targetY - bot.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 5) {
                const moveX = (dx / distance) * bot.currentSpeed;
                const moveY = (dy / distance) * bot.currentSpeed;
                
                const oldX = bot.x;
                const oldY = bot.y;
                
                bot.x += moveX;
                bot.y += moveY;
                
                // Check collision with obstacles
                if (this.checkBotObstacleCollision(bot)) {
                    bot.x = oldX;
                    bot.y = oldY;
                    // Change direction when hitting obstacle
                    bot.targetX = bot.x + (Math.random() - 0.5) * 200;
                    bot.targetY = bot.y + (Math.random() - 0.5) * 200;
                }
            }
            
            // Keep bot in world bounds
            bot.x = Math.max(bot.size, Math.min(this.world.width - bot.size, bot.x));
            bot.y = Math.max(bot.size, Math.min(this.world.height - bot.size, bot.y));
            
            // Check bitcoin collection for bots
            this.bitcoins.forEach(bitcoin => {
                if (!bitcoin.collected) {
                    const dist = Math.sqrt(
                        Math.pow(bot.x - bitcoin.x, 2) + 
                        Math.pow(bot.y - bitcoin.y, 2)
                    );
                    
                    if (dist < bot.size + bitcoin.size) {
                        bitcoin.collected = true;
                        bot.trail.push({
                            x: bitcoin.x,
                            y: bitcoin.y,
                            targetX: bot.x,
                            targetY: bot.y
                        });
                    }
                }
            });
            
            // Update bot trail
            if (bot.trail.length > 0) {
                let prevX = bot.x;
                let prevY = bot.y;
                
                bot.trail.forEach(segment => {
                    const targetX = prevX;
                    const targetY = prevY;
                    
                    segment.x += (targetX - segment.x) * 0.1;
                    segment.y += (targetY - segment.y) * 0.1;
                    
                    prevX = segment.x;
                    prevY = segment.y;
                });
            }
            
            // Check collision with player (steal trail mechanic!)
            const playerDist = Math.sqrt(
                Math.pow(bot.x - this.player.x, 2) + 
                Math.pow(bot.y - this.player.y, 2)
            );
            
            if (playerDist < bot.size + this.player.size) {
                // Bot steals player's trail!
                if (this.player.trail.length > 0) {
                    bot.trail = [...bot.trail, ...this.player.trail];
                    this.player.trail = [];
                }
            }
        });
    }
    
    checkBotObstacleCollision(bot) {
        for (let obstacle of this.obstacles) {
            if (bot.x - bot.size < obstacle.x + obstacle.width &&
                bot.x + bot.size > obstacle.x &&
                bot.y - bot.size < obstacle.y + obstacle.height &&
                bot.y + bot.size > obstacle.y) {
                return true;
            }
        }
        return false;
    }    
  
    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#16213e';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw obstacles (convert world to screen coordinates)
        this.ctx.fillStyle = '#8e44ad';
        this.obstacles.forEach(obstacle => {
            const screenX = obstacle.x - this.camera.x;
            const screenY = obstacle.y - this.camera.y;
            
            // Only draw if visible on screen
            if (screenX + obstacle.width > 0 && screenX < this.width &&
                screenY + obstacle.height > 0 && screenY < this.height) {
                this.ctx.fillRect(screenX, screenY, obstacle.width, obstacle.height);
            }
        });
        
        // Draw base (convert world to screen coordinates)
        const baseScreenX = this.base.x - this.camera.x;
        const baseScreenY = this.base.y - this.camera.y;
        
        if (baseScreenX + this.base.size > 0 && baseScreenX - this.base.size < this.width &&
            baseScreenY + this.base.size > 0 && baseScreenY - this.base.size < this.height) {
            this.ctx.fillStyle = this.base.color;
            this.ctx.fillRect(baseScreenX - this.base.size/2, baseScreenY - this.base.size/2, 
                             this.base.size, this.base.size);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('BASE', baseScreenX, baseScreenY + 4);
        }
        
        // Draw bitcoins (convert world to screen coordinates)
        this.bitcoins.forEach(bitcoin => {
            if (!bitcoin.collected) {
                const screenX = bitcoin.x - this.camera.x;
                const screenY = bitcoin.y - this.camera.y;
                
                // Only draw if visible on screen
                if (screenX > -20 && screenX < this.width + 20 &&
                    screenY > -20 && screenY < this.height + 20) {
                    this.ctx.fillStyle = '#f39c12';
                    this.ctx.font = '16px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('₿', screenX, screenY + 6);
                }
            }
        });
        
        // Draw trail (convert world to screen coordinates)
        this.player.trail.forEach((segment, index) => {
            const screenX = segment.x - this.camera.x;
            const screenY = segment.y - this.camera.y;
            
            this.ctx.fillStyle = '#f39c12';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('₿', screenX, screenY + 5);
            
            // Draw connection line to show trail
            if (index === 0) {
                const playerScreenX = this.player.x - this.camera.x;
                const playerScreenY = this.player.y - this.camera.y;
                
                this.ctx.strokeStyle = '#f39c12';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(playerScreenX, playerScreenY);
                this.ctx.lineTo(screenX, screenY);
                this.ctx.stroke();
            } else {
                const prevScreenX = this.player.trail[index-1].x - this.camera.x;
                const prevScreenY = this.player.trail[index-1].y - this.camera.y;
                
                this.ctx.strokeStyle = '#f39c12';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(prevScreenX, prevScreenY);
                this.ctx.lineTo(screenX, screenY);
                this.ctx.stroke();
            }
        });
        
        // Draw bots and their trails (convert world to screen coordinates)
        this.bots.forEach(bot => {
            const botScreenX = bot.x - this.camera.x;
            const botScreenY = bot.y - this.camera.y;
            
            // Only draw if visible on screen
            if (botScreenX > -50 && botScreenX < this.width + 50 &&
                botScreenY > -50 && botScreenY < this.height + 50) {
                
                // Draw bot trail
                bot.trail.forEach((segment, index) => {
                    const segmentScreenX = segment.x - this.camera.x;
                    const segmentScreenY = segment.y - this.camera.y;
                    
                    this.ctx.fillStyle = bot.color;
                    this.ctx.font = '12px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('₿', segmentScreenX, segmentScreenY + 4);
                    
                    // Draw connection line
                    if (index === 0) {
                        this.ctx.strokeStyle = bot.color;
                        this.ctx.lineWidth = 1.5;
                        this.ctx.beginPath();
                        this.ctx.moveTo(botScreenX, botScreenY);
                        this.ctx.lineTo(segmentScreenX, segmentScreenY);
                        this.ctx.stroke();
                    } else {
                        const prevSegmentScreenX = bot.trail[index-1].x - this.camera.x;
                        const prevSegmentScreenY = bot.trail[index-1].y - this.camera.y;
                        
                        this.ctx.strokeStyle = bot.color;
                        this.ctx.lineWidth = 1.5;
                        this.ctx.beginPath();
                        this.ctx.moveTo(prevSegmentScreenX, prevSegmentScreenY);
                        this.ctx.lineTo(segmentScreenX, segmentScreenY);
                        this.ctx.stroke();
                    }
                });
                
                // Draw bot
                this.ctx.fillStyle = bot.color;
                this.ctx.font = '20px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(bot.emoji, botScreenX, botScreenY + 7);
                
                // Add bitcoin symbol on bot
                this.ctx.fillStyle = bot.color;
                this.ctx.font = '10px Arial';
                this.ctx.fillText('₿', botScreenX, botScreenY - 8);
            }
        });
        
        // Draw player (convert world to screen coordinates)
        const playerScreenX = this.player.x - this.camera.x;
        const playerScreenY = this.player.y - this.camera.y;
        
        this.ctx.fillStyle = this.player.color;
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('👻', playerScreenX, playerScreenY + 8);
        
        // Add bitcoin symbol on ghost
        this.ctx.fillStyle = '#f39c12';
        this.ctx.font = '12px Arial';
        this.ctx.fillText('₿', playerScreenX, playerScreenY - 5);
        
        // Draw minimap in corner
        this.drawMinimap();
    }
    
    drawMinimap() {
        const minimapSize = 120;
        const minimapX = this.width - minimapSize - 10;
        const minimapY = 10;
        
        // Minimap background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize * (this.world.height / this.world.width));
        
        // Minimap border
        this.ctx.strokeStyle = '#f39c12';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize * (this.world.height / this.world.width));
        
        // Player position on minimap
        const playerMinimapX = minimapX + (this.player.x / this.world.width) * minimapSize;
        const playerMinimapY = minimapY + (this.player.y / this.world.height) * minimapSize * (this.world.height / this.world.width);
        
        this.ctx.fillStyle = '#f39c12';
        this.ctx.fillRect(playerMinimapX - 2, playerMinimapY - 2, 4, 4);
        
        // Base on minimap
        const baseMinimapX = minimapX + (this.base.x / this.world.width) * minimapSize;
        const baseMinimapY = minimapY + (this.base.y / this.world.height) * minimapSize * (this.world.height / this.world.width);
        
        this.ctx.fillStyle = '#27ae60';
        this.ctx.fillRect(baseMinimapX - 3, baseMinimapY - 3, 6, 6);
    }
    
    gameLoop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Start the game when page loads
window.addEventListener('load', () => {
    new BitcoinGhostGame();
});