let socket,
    player,
    state,
    playbackRate,
    roomCode,
    videoID,
    numWatchers,
    playerReady = false;

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: '',
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
    playerReady = true;
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

function loadVideoById(newVideoID) {
    videoID = newVideoID;
    player.loadVideoById(videoID, 5, 'large'); // what do these arguments mean?
}

function setNumWatchers(newValue) {
    numWatchers = newValue;
    document.getElementById('numWatchers').textContent = newValue;
}

function playVideo() {
    state = YT.PlayerState.PLAYING;
    player.playVideo();
}

function pauseVideo() {
    state = YT.PlayerState.PAUSED;
    player.pauseVideo();
}

function seekTo(timestamp) {
    player.seekTo(timestamp, true);
}

function setPlaybackRate(newPlaybackRate) {
    playbackRate = newPlaybackRate;
    player.setPlaybackRate(playbackRate);
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

    socket.on('getWatchRoomDataResponse', (response) => {
        const data = validateResponse(response);
        if (!data) {
            window.location.href = '/';
            return;
        }

        console.log(videoID);
        console.log(data.videoID);
        if (videoID !== data.videoID || videoID === null || videoID === undefined)
            loadVideoById(data.videoID);

        setNumWatchers(data.numWatchers);

        if (player.getCurrentTime() !== data.timestamp)
            seekTo(data.timestamp);

        if (player.getPlaybackRate() !== data.playbackRate)
            setPlaybackRate(data.playbackRate);

        pauseVideo(); // ??? why doesn't this work?
    });

    socket.on('loadVideoResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        if (videoID === data.videoID) return;

        loadVideoById(data.videoID);
    });

    socket.on('playResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        if (state === YT.PlayerState.PLAYING) return;

        seekTo(data.timestamp);

        playVideo();
    });

    socket.on('pauseResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        if (state === YT.PlayerState.PAUSED) return;

        seekTo(data.timestamp);

        pauseVideo();
    });

    socket.on('playbackRateResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        if (playbackRate === data.playbackRate) return;

        setPlaybackRate(data.playbackRate);
    });

    socket.on('watcherJoinResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        setNumWatchers(data.numWatchers);

        pauseVideo();
    });

    socket.on('watcherLeaveResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        setNumWatchers(data.numWatchers);
    });
}

function initHTML() {
    // forces the youtube player to not be cached so that it loads correctly
    const scriptUrl = 'https://www.youtube.com/iframe_api?v=' + Date.now();
    const scriptElement = document.createElement('script');
    scriptElement.src = scriptUrl;
    document.body.appendChild(scriptElement);

    document.getElementById('videoLinkInput').addEventListener('submit', function (event) {
        event.preventDefault();

        const inputValue = document.getElementById('videoLink').value;
        const retVal = getVideoIDFromURL(inputValue);
        const vID = retVal ? retVal : inputValue;

        loadVideoById(vID);

        socket.emit('loadVideo', {
            roomCode: roomCode,
            videoID: vID
        });
    });

    window.addEventListener('beforeunload', function (event) {
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
    setNumWatchers(0);

    initSocket();
    initHTML();

    // async spinning until the player is ready
    // then we can request information from server about the video
    function checkPlayer() {
        if (!playerReady) {
            setTimeout(checkPlayer, 500);
            return;
        }

        socket.emit('watcherJoin', {
            roomCode: roomCode
        });

        socket.emit('getWatchRoomData', {
            roomCode: roomCode
        });
    }

    checkPlayer();
});