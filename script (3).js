class MusicStorage {
    constructor() {
        this.dbName = 'MusicPlayerDB';
        this.dbVersion = 1;
        this.db = null;
        this.storeName = 'songs';
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('artist', 'artist', { unique: false });
                    store.createIndex('dateAdded', 'dateAdded', { unique: false });
                }
            };
        });
    }

    async saveSong(songData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.add({
                ...songData,
                dateAdded: new Date().toISOString()
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllSongs() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteSong(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearAll() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

class EnhancedMusicPlayer {
    constructor() {
        this.audio = document.getElementById('audioPlayer');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.progressBar = document.querySelector('.progress-bar');
        this.progress = document.getElementById('progress');
        this.progressHandle = document.getElementById('progressHandle');
        this.currentTimeEl = document.getElementById('currentTime');
        this.durationEl = document.getElementById('duration');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.trackTitle = document.getElementById('trackTitle');
        this.trackArtist = document.getElementById('trackArtist');
        this.albumArt = document.getElementById('albumArt');
        this.audioUpload = document.getElementById('audioUpload');
        this.playlistContainer = document.querySelector('.playlist-container');
        
        this.storage = new MusicStorage();
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.isPlaying = false;
        this.isDragging = false;
        this.lastProgressUpdate = 0;
        this.recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
        
        this.init();
    }

    async init() {
        try {
            await this.storage.init();
            await this.loadStoredSongs();
            this.setupEventListeners();
            this.setVolume(localStorage.getItem('volume') || 50);
            this.setupDragAndDrop();
            this.setupPlaylistManagement();
            this.setupSearch();
        } catch (error) {
            console.error('Failed to initialize music player:', error);
            this.setupEventListeners();
            this.setVolume(50);
            this.loadSampleTrack();
        }
    }

    async loadStoredSongs() {
        try {
            const storedSongs = await this.storage.getAllSongs();
            this.playlist = storedSongs.map(song => ({
                ...song,
                src: URL.createObjectURL(song.audioBlob)
            }));
            
            if (this.playlist.length > 0) {
                this.loadTrack(0);
                this.updatePlaylistDisplay();
            } else {
                this.loadSampleTrack();
            }
        } catch (error) {
            console.error('Failed to load stored songs:', error);
            this.loadSampleTrack();
        }
    }

    setupEventListeners() {
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.prevBtn.addEventListener('click', () => this.previousTrack());
        this.nextBtn.addEventListener('click', () => this.nextTrack());
        
        this.progressBar.addEventListener('click', (e) => this.setProgress(e));
        this.progressHandle.addEventListener('mousedown', () => this.startDragging());
        document.addEventListener('mousemove', (e) => this.handleDragging(e));
        document.addEventListener('mouseup', () => this.stopDragging());
        
        this.volumeSlider.addEventListener('input', (e) => {
            this.setVolume(e.target.value);
            localStorage.setItem('volume', e.target.value);
        });
        
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.nextTrack());
        
        this.audioUpload.addEventListener('change', (e) => this.handleFileUpload(e));
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    setupSearch() {
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                this.filterPlaylist(query);
                clearSearch.style.display = query ? 'block' : 'none';
            });
        }

        if (clearSearch) {
            clearSearch.addEventListener('click', () => {
                searchInput.value = '';
                this.filterPlaylist('');
                clearSearch.style.display = 'none';
            });
        }
    }

    setupDragAndDrop() {
        const dropZone = document.querySelector('.music-player');
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            const files = Array.from(e.dataTransfer.files);
            this.processFiles(files);
        });
    }

    setupPlaylistManagement() {
        const exportBtn = document.getElementById('exportPlaylist');
        const clearBtn = document.getElementById('clearAll');

        if (exportBtn) exportBtn.addEventListener('click', () => this.exportPlaylist());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAllSongs());
    }

    loadSampleTrack() {
        const sampleTrack = {
            title: 'Welcome to AYUSH\'S Player',
            artist: 'Sample Track',
            src: '',
            albumArt: './attached_assets/icon_1753919744489.png'
        };
        
        this.playlist = [sampleTrack];
        this.loadTrack(0);
        this.updatePlaylistDisplay();
    }

    async handleFileUpload(e) {
        const files = Array.from(e.target.files);
        await this.processFiles(files);
        e.target.value = '';
    }

    async processFiles(files) {
        const audioFiles = files.filter(file => file.type.startsWith('audio/'));
        
        if (audioFiles.length === 0) {
            this.showNotification('No audio files found', 'error');
            return;
        }

        this.showNotification(`Processing ${audioFiles.length} file(s)...`, 'info');
        
        for (const file of audioFiles) {
            try {
                const audioBlob = new Blob([file], { type: file.type });
                const songData = {
                    title: file.name.replace(/\.[^/.]+$/, ""),
                    artist: 'Unknown Artist',
                    audioBlob: audioBlob,
                    albumArt: './attached_assets/icon_1753919744489.png',
                    duration: 0,
                    fileSize: file.size
                };

                const id = await this.storage.saveSong(songData);
                const trackWithId = {
                    ...songData,
                    id: id,
                    src: URL.createObjectURL(audioBlob)
                };

                this.playlist.push(trackWithId);
                
                if (this.playlist.length === 1 && this.trackTitle.textContent === 'Select a song') {
                    this.loadTrack(0);
                }
            } catch (error) {
                console.error('Failed to save song:', error);
                this.showNotification(`Failed to save: ${file.name}`, 'error');
            }
        }
        
        this.updatePlaylistDisplay();
        this.showNotification(`Added ${audioFiles.length} song(s) to your library`, 'success');
    }

    togglePlayPause() {
        if (this.playlist.length === 0) {
            this.showNotification('No songs in playlist', 'error');
            return;
        }
        
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    play() {
        if (!this.audio.src) {
            this.showNotification('No track loaded', 'error');
            return;
        }

        this.audio.play().then(() => {
            this.isPlaying = true;
            this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            document.body.classList.add('playing');
        }).catch(error => {
            console.error('Failed to play audio:', error);
            this.showNotification('Failed to play audio', 'error');
        });
    }
    
    pause() {
        this.audio.pause();
        this.isPlaying = false;
        this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        document.body.classList.remove('playing');
    }
    
    previousTrack() {
        if (this.playlist.length === 0) return;
        
        this.currentTrackIndex = this.currentTrackIndex === 0 
            ? this.playlist.length - 1 
            : this.currentTrackIndex - 1;
        
        this.loadTrack(this.currentTrackIndex);
        if (this.isPlaying) this.play();
    }
    
    nextTrack() {
        if (this.playlist.length === 0) return;
        
        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        this.loadTrack(this.currentTrackIndex);
        if (this.isPlaying) this.play();
    }

    loadTrack(index) {
        if (!this.playlist[index]) return;
        
        const track = this.playlist[index];
        this.audio.src = track.src;
        this.trackTitle.textContent = track.title;
        this.trackArtist.textContent = track.artist;
        this.albumArt.src = track.albumArt || './attached_assets/icon_1753919744489.png';
        
        this.updatePlaylistDisplay();
        this.resetProgress();
        this.addToRecentlyPlayed(track);
    }

    addToRecentlyPlayed(track) {
        const recentTrack = {
            title: track.title,
            artist: track.artist,
            playedAt: new Date().toISOString()
        };
        
        this.recentlyPlayed = this.recentlyPlayed.filter(t => 
            !(t.title === track.title && t.artist === track.artist)
        );
        
        this.recentlyPlayed.unshift(recentTrack);
        this.recentlyPlayed = this.recentlyPlayed.slice(0, 10);
        
        localStorage.setItem('recentlyPlayed', JSON.stringify(this.recentlyPlayed));
    }

    async deleteSong(id, index) {
        if (!confirm('Are you sure you want to delete this song?')) {
            return;
        }

        try {
            await this.storage.deleteSong(id);
            this.playlist.splice(index, 1);
            
            if (index === this.currentTrackIndex) {
                if (this.playlist.length > 0) {
                    const newIndex = Math.min(index, this.playlist.length - 1);
                    this.currentTrackIndex = newIndex;
                    this.loadTrack(newIndex);
                } else {
                    this.resetPlayer();
                }
            } else if (index < this.currentTrackIndex) {
                this.currentTrackIndex--;
            }
            
            this.updatePlaylistDisplay();
            this.showNotification('Song deleted successfully', 'success');
        } catch (error) {
            console.error('Failed to delete song:', error);
            this.showNotification('Failed to delete song', 'error');
        }
    }

    resetPlayer() {
        this.audio.src = '';
        this.trackTitle.textContent = 'Select a song';
        this.trackArtist.textContent = 'Unknown Artist';
        this.albumArt.src = './attached_assets/icon_1753919744489.png';
        this.resetProgress();
        this.pause();
    }

    filterPlaylist(query) {
        const playlistItems = this.playlistContainer.querySelectorAll('.playlist-item:not(.upload-section)');
        
        playlistItems.forEach((item, index) => {
            const track = this.playlist[index];
            if (track) {
                const matchesSearch = query === '' || 
                    track.title.toLowerCase().includes(query.toLowerCase()) ||
                    track.artist.toLowerCase().includes(query.toLowerCase());
                
                item.style.display = matchesSearch ? 'flex' : 'none';
            }
        });
    }

    updatePlaylistDisplay() {
        const existingItems = this.playlistContainer.querySelectorAll('.playlist-item:not(.upload-section)');
        existingItems.forEach(item => item.remove());
        
        if (this.playlist.length === 0) {
            return;
        }
        
        this.playlist.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = `playlist-item ${index === this.currentTrackIndex ? 'active' : ''}`;
            item.innerHTML = `
                <i class="fas fa-music"></i>
                <div class="track-details">
                    <span class="track-name">${this.escapeHtml(track.title)}</span>
                    <span class="track-artist">${this.escapeHtml(track.artist)}</span>
                </div>
                <div class="track-actions">
                    <span class="track-duration">--:--</span>
                    ${track.id ? `<button class="delete-track" data-id="${track.id}" data-index="${index}" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            `;
            
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-track')) {
                    this.currentTrackIndex = index;
                    this.loadTrack(index);
                    if (this.isPlaying) this.play();
                }
            });

            const deleteBtn = item.querySelector('.delete-track');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteSong(parseInt(e.currentTarget.dataset.id), parseInt(e.currentTarget.dataset.index));
                });
            }
            
            const uploadSection = this.playlistContainer.querySelector('.upload-section');
            this.playlistContainer.insertBefore(item, uploadSection);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async exportPlaylist() {
        try {
            const playlistData = {
                name: 'AYUSH\'S Music Player Playlist',
                exported: new Date().toISOString(),
                songs: this.playlist.map(song => ({
                    title: song.title,
                    artist: song.artist,
                    albumArt: song.albumArt,
                    fileSize: song.fileSize || 0
                }))
            };
            
            const dataStr = JSON.stringify(playlistData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `playlist-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
            this.showNotification('Playlist exported successfully', 'success');
        } catch (error) {
            console.error('Failed to export playlist:', error);
            this.showNotification('Failed to export playlist', 'error');
        }
    }

    async clearAllSongs() {
        if (!confirm('Are you sure you want to delete all songs? This cannot be undone.')) {
            return;
        }

        try {
            await this.storage.clearAll();
            this.playlist = [];
            this.resetPlayer();
            this.updatePlaylistDisplay();
            this.showNotification('All songs deleted successfully', 'success');
        } catch (error) {
            console.error('Failed to clear all songs:', error);
            this.showNotification('Failed to clear all songs', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => {
            document.body.removeChild(notification);
        });

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    setProgress(e) {
        if (this.audio.duration) {
            const rect = this.progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const newTime = percent * this.audio.duration;
            this.audio.currentTime = newTime;
        }
    }
    
    startDragging() {
        this.isDragging = true;
    }
    
    handleDragging(e) {
        if (!this.isDragging || !this.audio.duration) return;
        
        const rect = this.progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = percent * this.audio.duration;
        this.audio.currentTime = newTime;
    }
    
    stopDragging() {
        this.isDragging = false;
    }
    
    updateProgress() {
        const now = Date.now();
        if (!this.isDragging && this.audio.duration && (now - this.lastProgressUpdate > 100)) {
            this.lastProgressUpdate = now;
            requestAnimationFrame(() => {
                const percent = (this.audio.currentTime / this.audio.duration) * 100;
                this.progress.style.width = percent + '%';
                this.progressHandle.style.left = percent + '%';
                this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
            });
        }
    }
    
    updateDuration() {
        this.durationEl.textContent = this.formatTime(this.audio.duration);
        
        const currentItem = this.playlistContainer.querySelector('.playlist-item.active .track-duration');
        if (currentItem) {
            currentItem.textContent = this.formatTime(this.audio.duration);
        }
    }
    
    resetProgress() {
        this.progress.style.width = '0%';
        this.progressHandle.style.left = '0%';
        this.currentTimeEl.textContent = '0:00';
        this.durationEl.textContent = '0:00';
    }
    
    setVolume(value) {
        this.audio.volume = value / 100;
        this.volumeSlider.value = value;
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT') return;

        switch(e.code) {
            case 'Space':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'ArrowLeft':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.previousTrack();
                }
                break;
            case 'ArrowRight':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.nextTrack();
                }
                break;
            case 'ArrowUp':
                if (e.ctrlKey) {
                    e.preventDefault();
                    const newVolume = Math.min(100, parseInt(this.volumeSlider.value) + 10);
                    this.setVolume(newVolume);
                    localStorage.setItem('volume', newVolume);
                }
                break;
            case 'ArrowDown':
                if (e.ctrlKey) {
                    e.preventDefault();
                    const newVolume = Math.max(0, parseInt(this.volumeSlider.value) - 10);
                    this.setVolume(newVolume);
                    localStorage.setItem('volume', newVolume);
                }
                break;
            case 'KeyS':
                if (e.ctrlKey) {
                    e.preventDefault();
                    const searchInput = document.getElementById('searchInput');
                    if (searchInput) {
                        searchInput.focus();
                    }
                }
                break;
        }
    }
}

// Initialize the music player when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new EnhancedMusicPlayer();
});