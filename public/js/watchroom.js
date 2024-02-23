let socket,
    player,
    state,
    playbackRate,
    roomCode,
    videoID,
    numWatchers,
    playerReady = false,
    $player;

let $canvas, context,
    canvasX, canvasY,
    lastX, lastY,
    drawingEnabled = false,
    canvasMouseDown;

let $body;

class Timer {
    constructor(callback) {
        this.timerInterval = null;
        this.callback = callback;
    }

    start() {
        this.timerInterval = setInterval(() => {
            this.callback();
        }, 1 * 1000);
    }

    stop() {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
    }
}

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '480',
        width: '854',
        videoId: '',
        playerVars: {
            'videoId': 'KBh7kcSwxbg',
            'playsinline': 1,
            'autoplay': 0 // DOES NOT WORK ON BRAVE
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onPlaybackRateChange': onPlaybackRateChange,
            'onAutoplayBlocked': pauseVideo // test
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
    if (playbackRate === event.data) return;

    playbackRate = event.data;

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
    $('#numWatchers').text(newValue);
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

function checkSync() {
    socket.emit('syncTimestamp', {
        roomCode: roomCode,
        timestamp: player.getCurrentTime()
    });
}

function getVideoIDFromURL(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*\/|.*v=|.*vi=))([^&?]+)/);
    return (match && match[1]) ? match[1] : null;
}

function copyURLToClipboard() {
    navigator.clipboard.writeText(window.location.href);
}

function drawImage(data) {
    const img = new Image();
    img.src = data;
    img.onload = function() {
        context.clearRect(0, 0, $canvas.width, $canvas.height);
        context.drawImage(img, 0, 0);
    };
}

function initSocket() {
    socket = io();

    socket.on('getWatchRoomDataResponse', (response) => {
        const data = validateResponse(response);
        if (!data) {
            window.location.href = '/';
            return;
        }

        if (videoID !== data.videoID || videoID === null || videoID === undefined)
            loadVideoById(data.videoID);

        setNumWatchers(data.numWatchers);

        if (player.getCurrentTime() !== data.timestamp)
            seekTo(data.timestamp);

        if (player.getPlaybackRate() !== data.playbackRate)
            setPlaybackRate(data.playbackRate);

        pauseVideo(); // ??? why doesn't this work?

        drawImage(data.drawData);
    });

    socket.on('drawResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        drawImage(data.drawData);
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
    $canvas = $("canvas");
    $body = $('body');

    // forces the youtube player to not be cached so that it loads correctly
    const scriptUrl = 'https://www.youtube.com/iframe_api?v=' + Date.now();
    const scriptElement = $('<script></script>', { src: scriptUrl });
    $body.append(scriptElement);

    $('#videoLinkInput').submit(function (event) {
        event.preventDefault();

        const inputValue = $('#videoLink').val();
        const retVal = getVideoIDFromURL(inputValue);
        const vID = retVal ? retVal : inputValue;

        loadVideoById(vID);

        socket.emit('loadVideo', {
            roomCode: roomCode,
            videoID: vID
        });
    });

    $(window).on('beforeunload', function () {
        socket.emit('watcherLeave', {
            roomCode: roomCode
        });
    });

    context = $canvas[0].getContext("2d");
    context.lineWidth = 3;
    context.strokeStyle = 'red';

    $('#drawButton').click(function () {
        drawingEnabled = !drawingEnabled;
        if (drawingEnabled) {
            $canvas.css('pointer-events', 'auto');
            $player.css('pointer-events', 'none');
        } else {
            $canvas.css('pointer-events', 'none');
            $player.css('pointer-events', 'auto');
        }
    });
}

function initWhiteboard() {
    canvasMouseDown = false;

    $canvas.mousedown(function (e) {
        canvasMouseDown = true;
        context.beginPath();
        canvasX = e.offsetX;
        canvasY = e.offsetY;
        context.moveTo(canvasX, canvasY);

        lastX = canvasX;
        lastY = canvasY;
    }).mousemove(function (e) {
        if (!canvasMouseDown) return;
        if (!drawingEnabled) return;

        canvasX = e.offsetX;
        canvasY = e.offsetY;
        context.lineTo(canvasX, canvasY);
        context.stroke();

        socket.emit('draw', {
            roomCode: roomCode,
            drawData: $canvas[0].toDataURL()
        });

        console.log($canvas[0].toDataURL());

        lastX = canvasX;
        lastY = canvasY;
    }).mouseup(function () {
        canvasMouseDown = false;
        context.closePath();

        lastX = null;
        lastY = null;
    }).mouseleave(function () {
        $canvas.mouseup();
    });
}

function getCurrentDomain() {
    return window.location.hostname.split('.').slice(-2).join('.');
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

window.onload = function () {
    roomCode = getRoomCode();
    setNumWatchers(0);

    initSocket();
    initHTML();
    initWhiteboard();

    // async spinning until the player is ready
    // then we can request information from server about the video
    function checkPlayer() {
        if (!playerReady) {
            setTimeout(checkPlayer, 500);
            return;
        }

        $player = $('#player');

        socket.emit('watcherJoin', {
            roomCode: roomCode
        });

        socket.emit('getWatchRoomData', {
            roomCode: roomCode
        });

        // const playSyncTimer = new Timer(checkSync);
    }

    checkPlayer();
};