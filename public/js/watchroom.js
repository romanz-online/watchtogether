let socket;
let player;
let state;
let playbackRate;
let roomCode;
let videoID;
let numWatchers;

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: 'RqooLet7B2Q',
        playerVars: {
            'playsinline': 1,
            'autoplay': 0 // DOES NOT WORK ON BRAVE
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onPlaybackRateChange': onPlaybackRateChange
        }
    });
}

function onPlayerReady(event) {
    state = player.getPlayerState();
    playbackRate = player.getPlaybackRate();
    videoID = getVideoIDFromURL(player.getVideoUrl());
}

function onPlaybackRateChange(event) {
    if (playbackRate === player.getPlaybackRate()) return;

    playbackRate = player.getPlaybackRate();

    socket.emit('playbackRate', {
        roomCode: roomCode,
        playbackRate: playbackRate
    });
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        if (state === YT.PlayerState.PLAYING) return;

        state = YT.PlayerState.PLAYING;
        socket.emit('play', {
            roomCode: roomCode,
            timestamp: player.getCurrentTime()
        });
    }

    if (event.data === YT.PlayerState.PAUSED) {
        if (state === YT.PlayerState.PAUSED) return;

        state = YT.PlayerState.PAUSED;
        socket.emit('pause', {
            roomCode: roomCode,
            timestamp: player.getCurrentTime()
        });
    }
}

function getVideoIDFromURL(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*\/|.*v=|.*vi=))([^&?]+)/);
    return (match && match[1]) ? match[1] : null;
}

function copyURLToClipboard() {
    navigator.clipboard.writeText(window.location.href);
}

function initSocket() {
    socket = io();

    socket.on('loadVideoResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        if (videoID === data.videoID) return;

        videoID = data.videoID;
        player.loadVideoById(videoID, 5, 'large');
    });

    socket.on('playResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        if (state === YT.PlayerState.PLAYING) return;

        player.seekTo(data.timestamp, true);

        state = YT.PlayerState.PLAYING;
        player.playVideo();
    });

    socket.on('pauseResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        if (state === YT.PlayerState.PAUSED) return;

        player.seekTo(data.timestamp, true);

        state = YT.PlayerState.PAUSED;
        player.pauseVideo();
    });

    socket.on('playbackRateResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        if (playbackRate === data.playbackRate) return;

        playbackRate = data.playbackRate;
        player.setPlaybackRate(playbackRate);
    });

    socket.on('watcherJoinResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        numWatchers = data.numWatchers;

        document.getElementById('numWatchers').textContent = numWatchers;
    });

    socket.on('watcherLeaveResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        numWatchers = data.numWatchers;

        document.getElementById('numWatchers').textContent = numWatchers;
    });
}

function initHTML() {
    // forces the youtube player to not be cached so that it loads correctly
    const scriptUrl = 'https://www.youtube.com/iframe_api?v=' + Date.now();
    const scriptElement = document.createElement('script');
    scriptElement.src = scriptUrl;
    document.body.appendChild(scriptElement);

    document.getElementById('videoLinkInput').addEventListener('submit', function(event) {
        event.preventDefault();
        
        const inputValue = document.getElementById('videoLink').value;
        const retVal = getVideoIDFromURL(inputValue);
        const vID = retVal ? retVal : inputValue;
    
        player.loadVideoById(vID, 5, 'large');
        videoID = vID;
    
        socket.emit('loadVideo', {
            roomCode: roomCode,
            videoID: vID
        });
    });

    window.addEventListener('beforeunload', function(event) {
        socket.emit('watcherLeave', {
            roomCode: roomCode
        });
    });
}

function getRoomCode() {
    return new URLSearchParams(window.location.search).get('roomCode');
}

function validateResponse(response) {
    const { success, signal, data } = response;
    console.log(success ? 'SUCCESS' : 'FAIL', signal);
    if (!success) return null;
    if (data.roomCode !== roomCode) return null;
    return data;
}

document.addEventListener('DOMContentLoaded', function () {
    roomCode = getRoomCode();
    numWatchers = 0;

    initSocket();

    socket.emit('watcherJoin', {
        roomCode: roomCode
    });

    initHTML();
});