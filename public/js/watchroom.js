let socket,
    player,
    state,
    playbackRate,
    roomCode,
    videoID,
    numWatchers,
    playerReady = false,
    playerElement;

let canvasElement,
    context,
    lastX,
    lastY,
    drawingEnabled = false;

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
    });

    socket.on('drawResponse', (response) => {
        const data = validateResponse(response);
        if (!data) return;

        context.strokeStyle = data.color;
        context.lineWidth = data.lineWidth;
        context.beginPath();
        if (data.lastX && data.lastY) {
            context.moveTo(data.lastX, data.lastY);
        }
        context.lineTo(data.x, data.y);
        context.stroke();
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
    const scriptElement = $('<script></script>', { src: scriptUrl });
    $('body').append(scriptElement);

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

    // canvasElement
    canvasElement = document.getElementById('canvas');
    context = canvasElement.getContext('2d');
    context.lineWidth = 2;
    context.strokeStyle = 'red';

    $('#drawButton').click(function () {
        if (drawingEnabled) {
            console.log('disable drawing');
            drawingEnabled = false;
            canvasElement.style.pointerEvents = 'none';
            playerElement.css('pointer-events', 'auto');
        } else {
            console.log('enable drawing');
            drawingEnabled = true;
            canvasElement.style.pointerEvents = 'auto';
            playerElement.css('pointer-events', 'none');
        }
    });
}

function initWhiteboard() {
    if (canvasElement) {
        let isDown = false;
        let canvasX, canvasY;
        context.lineWidth = 3;

        $('#canvas')
            .mousedown(function (e) {
                isDown = true;
                context.beginPath();
                canvasX = e.offsetX;
                canvasY = e.offsetY;
                context.moveTo(canvasX, canvasY);

                lastX = canvasX;
                lastY = canvasY;
            })
            .mousemove(function (e) {
                if (isDown !== false) {
                    canvasX = e.offsetX;
                    canvasY = e.offsetY;
                    context.lineTo(canvasX, canvasY);
                    context.strokeStyle = 'red';
                    context.stroke();
                    
                    socket.emit('draw', {
                        roomCode: roomCode,
                        lastX: lastX,
                        lastY: lastY,
                        x: canvasX,
                        y: canvasY,
                        color: 'red',
                        lineWidth: 3
                    });
    
                    lastX = canvasX;
                    lastY = canvasY;
                }
            })
            .mouseup(function (e) {
                isDown = false;
                context.closePath();

                lastX = null;
                lastY = null;
            });
    }

    // COMMENTED CODE IS FOR TOUCHSCREENS
    // FUNCTIONAL BUT NOT DONE AND NOT WORKING
    // ON IT FOR NOW

    // draw = {
    //     started: false,
    //     start: function (evt) {
    //         if (drawingEnabled) {
    //             context.beginPath();
    //             context.moveTo(
    //                 evt.touches[0].pageX,
    //                 evt.touches[0].pageY
    //             );

    //             lastX = evt.touches[0].pageX;
    //             lastY = evt.touches[0].pageY;

    //             this.started = true;
    //         }
    //     },
    //     move: function (evt) {
    //         if (this.started) {
    //             context.lineTo(
    //                 evt.touches[0].pageX,
    //                 evt.touches[0].pageY
    //             );

    //             context.strokeStyle = 'red';
    //             context.lineWidth = 3;
    //             context.stroke();

    //             console.log('EMITTING');
    //             socket.emit('draw', {
    //                 roomCode: roomCode,
    //                 lastX: lastX,
    //                 lastY: lastY,
    //                 x: x,
    //                 y: y,
    //                 color: 'red',
    //                 lineWidth: 3
    //             });

    //             lastX = x;
    //             lastY = y;
    //         }
    //     },
    //     end: function (evt) {
    //         this.started = false;

    //         lastX = null;
    //         lastY = null;
    //     }
    // };

    // canvasElement.addEventListener('touchstart', draw.start, false);
    // canvasElement.addEventListener('touchend', draw.end, false);
    // canvasElement.addEventListener('touchmove', draw.move, false);
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

        playerElement = $('#player');

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