let playlist = [], currentTrackIndex = 0, isPlaying = false;
let audioEngine = null, dragEco = null, musicPlayer = null, ecoResizer = null;
let isDraggingEco=false, isResizingEco=false, ecoX=0, ecoY=0, tgEcoX=0, tgEcoY=0, ecoScale=1, tgEcoScale=1, startScale=1, ecoStartX=0, ecoStartY=0, mouseStartX=0, mouseStartY=0;

function formatTime(t) {
    if(isNaN(t)) return "0:00";
    return `${Math.floor(t/60)}:${Math.floor(t%60).toString().padStart(2, '0')}`;
}

function extractCategoryFromSrc(src) {
    if(!src) return "Unknown";
    const match = src.match(/\/assets\/music\/([^\/]+)\//);
    let cat = match ? match[1] : "Unknown";
    cat = decodeURIComponent(cat);
    return cat.toLowerCase() === 'gta' ? 'Grand Theft Auto' : cat.charAt(0).toUpperCase() + cat.slice(1);
}

async function fetchMusicManifest() {
    try {
        const res = await fetch('/assets/music/music-manifest.json?v=' + new Date().getTime());
        const data = await res.json();
        playlist = data.map((t, i) => { t.originalIndex = i; t.category = extractCategoryFromSrc(t.src); return t; });
        if(playlist && playlist.length > 0) {
            loadTrack(0); populateLibraryCategories(); buildLibraryUI(playlist);
        } else {
            document.getElementById('player-title').innerText = "No Tracks Found";
        }
    } catch(err) { console.error("Manifest Load Error:", err); }
}

function initMusicPlayer() {
    audioEngine = document.getElementById('global-audio');
    if(!audioEngine) return;
    fetchMusicManifest();
    audioEngine.addEventListener('timeupdate', () => {
        if(audioEngine.duration) {
            document.getElementById('progress-bar').style.width = `${(audioEngine.currentTime / audioEngine.duration) * 100}%`;
            document.getElementById('current-time').innerText = formatTime(audioEngine.currentTime);
        }
    });
    audioEngine.addEventListener('loadedmetadata', () => document.getElementById('duration-time').innerText = formatTime(audioEngine.duration));
    audioEngine.addEventListener('ended', nextTrack);
    bindPlayerDrag();
}

function loadTrack(idx) {
    currentTrackIndex = idx;
    const track = playlist[idx];
    audioEngine.src = track.src;
    document.getElementById('player-category').innerText = escapeHTML(track.category);
    document.getElementById('player-title').innerText = escapeHTML(track.title);
    document.getElementById('vinyl-spin').src = track.cover || '/assets/images/logo.png';
    updateLibraryHighlight();
}

function togglePlay() {
    const btn = document.getElementById('play-btn'), vinyl = document.getElementById('vinyl-spin');
    if(isPlaying) {
        audioEngine.pause();
        btn.innerHTML = '<i class="fas fa-circle-play"></i>';
        vinyl.classList.remove('playing');
        isPlaying = false;
    } else {
        audioEngine.play().then(() => {
            btn.innerHTML = '<i class="fas fa-circle-pause"></i>';
            vinyl.classList.add('playing');
            isPlaying = true;
        }).catch(err => console.warn(err));
    }
}

function nextTrack() { loadTrack((currentTrackIndex + 1) % playlist.length); if(isPlaying) audioEngine.play(); }
function prevTrack() { loadTrack((currentTrackIndex - 1 + playlist.length) % playlist.length); if(isPlaying) audioEngine.play(); }
function seekAudio(e) {
    const rect = document.getElementById('progress-bar-container').getBoundingClientRect();
    audioEngine.currentTime = ((e.clientX - rect.left) / rect.width) * audioEngine.duration;
}

function togglePlayerSize() {
    const player = document.getElementById('music-player'), btn = document.getElementById('resize-btn');
    if(player.classList.contains('maximized')) {
        player.classList.replace('maximized', 'minimized');
        btn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>'; btn.title = "Maximize";
        if(document.getElementById('music-ecosystem').classList.contains('ecosystem-active')) toggleLibrary();
    } else {
        player.classList.replace('minimized', 'maximized');
        btn.innerHTML = '<i class="fas fa-compress-alt"></i>'; btn.title = "Minimize";
    }
}

function toggleLibrary() {
    const eco = document.getElementById('music-ecosystem'), player = document.getElementById('music-player');
    if(!eco.classList.contains('ecosystem-active') && player.classList.contains('minimized')) togglePlayerSize();
    eco.classList.toggle('ecosystem-active');
}

function populateLibraryCategories() {
    const cats = [...new Set(playlist.map(t => t.category))];
    document.getElementById('libCategory').innerHTML = '<option value="all">All Categories</option>' + cats.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
}

function filterLibrary() {
    const search = document.getElementById('libSearch').value.toLowerCase(), cat = document.getElementById('libCategory').value;
    buildLibraryUI(playlist.filter(t => t.title.toLowerCase().includes(search) && (cat === 'all' || t.category === cat)));
}

function buildLibraryUI(tracks) {
    const list = document.getElementById('library-list');
    if(tracks.length === 0) return list.innerHTML = '<p style="text-align:center; padding: 2rem 0; color:var(--text-muted); font-size:0.85rem;">No tracks found.</p>';
    list.innerHTML = tracks.map(t => `<div class="lib-item" id="lib-track-${t.originalIndex}" onclick="playFromLibrary(${t.originalIndex})"><img src="${t.cover || '/assets/images/logo.png'}" class="lib-item-cover" alt="Cover" onerror="this.src='./assets/images/logo.png'"><div class="lib-item-info"><h4>${escapeHTML(t.title)}</h4><span>${escapeHTML(t.category)}</span></div></div>`).join('');
    updateLibraryHighlight();
}

function playFromLibrary(idx) {
    if(idx !== currentTrackIndex) { loadTrack(idx); if(isPlaying) audioEngine.play(); else togglePlay(); } 
    else togglePlay();
}

function updateLibraryHighlight() {
    document.querySelectorAll('.lib-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`lib-track-${currentTrackIndex}`)?.classList.add('active');
}

// --- DRAG AND RESIZE LOGIC ---
function bindPlayerDrag() {
    dragEco = document.getElementById('music-ecosystem'); musicPlayer = document.getElementById('music-player'); ecoResizer = document.getElementById('eco-resizer');
    if(ecoResizer) {
        ecoResizer.addEventListener('mousedown', e => {
            e.stopPropagation(); isResizingEco = true; mouseStartX = e.clientX; mouseStartY = e.clientY; startScale = tgEcoScale;
            document.body.style.cursor = 'nwse-resize'; document.body.style.userSelect = 'none';
        });
    }
    if(musicPlayer) {
        musicPlayer.style.cursor = 'grab';
        musicPlayer.addEventListener('mousedown', e => {
            if(e.target.closest('button') || e.target.closest('.progress-container') || e.target.tagName.toLowerCase() === 'img' || e.target.closest('.eco-resizer')) return;
            isDraggingEco = true; mouseStartX = e.clientX; mouseStartY = e.clientY; ecoStartX = tgEcoX; ecoStartY = tgEcoY;
            musicPlayer.style.cursor = 'grabbing'; document.body.style.userSelect = 'none';
        });
    }
}

window.addEventListener('mousemove', e => {
    if(isDraggingEco) { tgEcoX = ecoStartX + (e.clientX - mouseStartX); tgEcoY = ecoStartY + (e.clientY - mouseStartY); }
    if(isResizingEco) { tgEcoScale = Math.max(0.5, Math.min(2.5, startScale + ((mouseStartX - e.clientX) + (mouseStartY - e.clientY)) * 0.003)); }
});

window.addEventListener('mouseup', () => {
    if(isDraggingEco) { isDraggingEco = false; if(musicPlayer) musicPlayer.style.cursor = 'grab'; document.body.style.userSelect = ''; }
    if(isResizingEco) { isResizingEco = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; }
});
